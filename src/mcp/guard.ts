import { revalidatePath } from "next/cache";
import type { CallToolResult, InputRequiredResult, ServerContext } from "@modelcontextprotocol/server";
import type { Prisma } from "@prisma/client";
import type { ZodType } from "zod";

import { DomainError, InvalidOperationError, NotFoundError } from "@/lib/errors";
import { FxUnavailableError } from "@/lib/fxService";
import { recordAgentCall, type AgentVerdict } from "@/lib/agentAudit";
import { checkAgentRateLimit } from "@/lib/agentRateLimit";
import { describeDeletionImpact, type DeletionTarget } from "@/lib/deletionImpact";
import { REVALIDATION_TARGETS, type RevalidationDomain } from "@/lib/revalidation";
import { agentContextFrom, type AgentContext } from "@/mcp/context";
import { scopeForTool } from "@/mcp/scopes";
import { readConfirmation, requestConfirmation } from "@/mcp/confirm";
import { deletionImpactDto } from "@/mcp/serializers";

/**
 * Fronteira única entre os serviços de domínio e o protocolo MCP.
 *
 * Irmão de `src/actions/guard.ts`, e a duplicação é deliberada: lá existe o
 * caminho do `redirect("/login")`, que aqui não existe — a falha de
 * autenticação é um 401 antes de chegar neste módulo. E o agente precisa de
 * erro classificado com `code` e `retry`, não de mensagem pronta para um
 * formulário.
 *
 * As duas cascas compartilham os schemas Zod de `src/lib/validations.ts`: é o
 * que impede o agente de gravar algo que a UI recusaria.
 */

type ToolFailureCode =
  | "unauthenticated"
  | "forbidden_scope"
  | "rate_limited"
  | "invalid_input"
  | "not_found"
  | "invalid_operation"
  | "domain_error"
  | "fx_unavailable"
  | "internal";

interface ToolFailure {
  ok: false;
  code: ToolFailureCode;
  message: string;
  field?: string;
  retry?: { with: string[] };
}

/** Limite por string no log: argumento gigante não deve inflar a auditoria. */
const MAX_LOGGED_STRING = 512;

/**
 * Prepara os argumentos para a coluna `args`.
 *
 * Trunca texto livre e garante que o valor é serializável: um `undefined` ou um
 * `BigInt` derrubariam a gravação do log inteiro.
 */
function sanitizeArgs(input: unknown): Prisma.InputJsonValue {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      return value.length > MAX_LOGGED_STRING
        ? `${value.slice(0, MAX_LOGGED_STRING)}…[truncado]`
        : value;
    }

    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(walk);
    }

    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, walk(inner)]),
      );
    }

    // `undefined`, função, symbol, BigInt: sem representação JSON honesta.
    return null;
  };

  return (walk(input) ?? null) as Prisma.InputJsonValue;
}

function jsonResult(payload: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

function failure(failureValue: ToolFailure): CallToolResult {
  return jsonResult(failureValue, true);
}

/** Traduz o erro de domínio no par (código para o agente, veredito para o log). */
function classify(error: unknown): { failure: ToolFailure; verdict: AgentVerdict } {
  if (error instanceof FxUnavailableError) {
    return {
      verdict: "FX_UNAVAILABLE",
      failure: {
        ok: false,
        code: "fx_unavailable",
        message: "Taxa de câmbio indisponível. Reenvie informando manualFxRate.",
        // O mesmo contrato que `needsManualFxRate` dá ao formulário: diz o que
        // mudar em vez de só recusar.
        retry: { with: ["manualFxRate"] },
      },
    };
  }

  if (error instanceof NotFoundError) {
    return {
      verdict: "DOMAIN_ERROR",
      failure: { ok: false, code: "not_found", message: error.message },
    };
  }

  if (error instanceof InvalidOperationError) {
    return {
      verdict: "DOMAIN_ERROR",
      failure: { ok: false, code: "invalid_operation", message: error.message },
    };
  }

  if (error instanceof DomainError) {
    return {
      verdict: "DOMAIN_ERROR",
      failure: { ok: false, code: "domain_error", message: error.message },
    };
  }

  // Desconhecido: registra no servidor e devolve texto genérico. Nenhuma
  // ferramenta vaza mensagem interna, stack ou SQL.
  console.error("Erro inesperado em ferramenta MCP:", error);

  return {
    verdict: "ERROR",
    failure: {
      ok: false,
      code: "internal",
      message: "Ocorreu um erro inesperado ao executar a operação.",
    },
  };
}

/**
 * Invalida o cache das telas afetadas — e **nunca** propaga erro.
 *
 * Roda depois de a escrita ter commitado e sido auditada como `OK`. Deixar a
 * falha subir devolveria fracasso ao agente para uma operação que deu certo.
 *
 * A lista de caminhos vem de {@link REVALIDATION_TARGETS}, a mesma que as
 * actions consomem: a tabela que existia aqui se declarava espelho da de lá e
 * divergia em quatro domínios.
 */
function revalidate(domain: RevalidationDomain): void {
  for (const [path, type] of REVALIDATION_TARGETS[domain]) {
    try {
      revalidatePath(path, type);
    } catch (error) {
      console.error(`Falha ao revalidar ${path} após ferramenta MCP:`, error);
    }
  }
}

/**
 * Guardas comuns a toda ferramenta: identidade, escopo, cota.
 *
 * Devolve o contexto, ou a recusa já pronta junto do veredito — **toda** recusa
 * vai para a auditoria.
 */
async function authorize(
  ctx: ServerContext,
  tool: string,
): Promise<
  | { ok: true; agent: AgentContext }
  | { ok: false; result: CallToolResult; verdict: AgentVerdict; agent: AgentContext | null }
> {
  const agent = agentContextFrom(ctx.http?.authInfo);

  if (!agent) {
    return {
      ok: false,
      agent: null,
      verdict: "FORBIDDEN_SCOPE",
      result: failure({
        ok: false,
        code: "unauthenticated",
        message: "Token de agente inválido ou sem identidade associada.",
      }),
    };
  }

  const required = scopeForTool(tool);

  // Ferramenta sem escopo mapeado é erro de programação: falha fechado.
  if (!required || !agent.scopes.includes(required)) {
    return {
      ok: false,
      agent,
      verdict: "FORBIDDEN_SCOPE",
      result: failure({
        ok: false,
        code: "forbidden_scope",
        message: required
          ? `Esta operação exige o escopo "${required}", que este token não tem.`
          : "Ferramenta sem escopo declarado.",
      }),
    };
  }

  const rate = await checkAgentRateLimit(agent.tokenId);

  if (!rate.allowed) {
    return {
      ok: false,
      agent,
      verdict: "RATE_LIMITED",
      result: failure({
        ok: false,
        code: "rate_limited",
        message: `Limite de ${rate.limit} chamadas por minuto atingido. Aguarde antes de repetir.`,
      }),
    };
  }

  return { ok: true, agent };
}

export interface RunToolParams<TInput, TResult> {
  ctx: ServerContext;
  tool: string;
  input: unknown;
  schema: ZodType<TInput>;
  run: (agent: AgentContext, input: TInput) => Promise<TResult>;
  serialize: (result: TResult, agent: AgentContext) => unknown;
  /** IDs tocados — é o que permite reconstituir e desfazer depois. */
  affected?: (result: TResult) => string[];
  /** Domínio afetado. Ausente = leitura, nada a invalidar. */
  revalidates?: RevalidationDomain;
}

export async function runTool<TInput, TResult>(
  params: RunToolParams<TInput, TResult>,
): Promise<CallToolResult> {
  const started = Date.now();
  const args = sanitizeArgs(params.input);

  const log = (
    verdict: AgentVerdict,
    agent: AgentContext | null,
    errorCode?: string | null,
    affectedIds?: readonly string[],
  ) =>
    recordAgentCall({
      tokenId: agent?.tokenId ?? null,
      userId: agent?.userId ?? null,
      tool: params.tool,
      verdict,
      args,
      affectedIds,
      errorCode,
      durationMs: Date.now() - started,
    });

  const auth = await authorize(params.ctx, params.tool);

  if (!auth.ok) {
    await log(auth.verdict, auth.agent);

    return auth.result;
  }

  const parsed = params.schema.safeParse(params.input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    await log("INVALID_INPUT", auth.agent, issue?.code);

    return failure({
      ok: false,
      code: "invalid_input",
      message: issue?.message ?? "Entrada inválida",
      field: issue?.path.join(".") || undefined,
    });
  }

  try {
    const result = await params.run(auth.agent, parsed.data);
    const affectedIds = params.affected?.(result);

    await log("OK", auth.agent, null, affectedIds);

    if (params.revalidates) {
      revalidate(params.revalidates);
    }

    return jsonResult({ ok: true, data: params.serialize(result, auth.agent) });
  } catch (error) {
    const { failure: toolFailure, verdict } = classify(error);

    await log(verdict, auth.agent, toolFailure.code);

    return failure(toolFailure);
  }
}

export interface RunDestructiveToolParams {
  ctx: ServerContext;
  tool: string;
  target: DeletionTarget;
  input: unknown;
  schema: ZodType<{ id: string }>;
  run: (agent: AgentContext, id: string) => Promise<void>;
  revalidates: RevalidationDomain;
}

/**
 * Remoção em cascata: mede o impacto, pede confirmação, e só então apaga.
 *
 * A primeira chamada não executa nada — devolve `inputRequired`, e a pergunta
 * vai ao cliente.
 *
 * O impacto é medido antes de pedir a confirmação: a pergunta precisa dos
 * números, e um `blockedBy` conhecido já recusa aqui, sem gastar uma rodada.
 */
export async function runDestructiveTool(
  params: RunDestructiveToolParams,
): Promise<CallToolResult | InputRequiredResult> {
  const started = Date.now();
  const args = sanitizeArgs(params.input);

  const log = (
    verdict: AgentVerdict,
    agent: AgentContext | null,
    errorCode?: string | null,
    affectedIds?: readonly string[],
  ) =>
    recordAgentCall({
      tokenId: agent?.tokenId ?? null,
      userId: agent?.userId ?? null,
      tool: params.tool,
      verdict,
      args,
      affectedIds,
      errorCode,
      durationMs: Date.now() - started,
    });

  const auth = await authorize(params.ctx, params.tool);

  if (!auth.ok) {
    await log(auth.verdict, auth.agent);

    return auth.result;
  }

  const parsed = params.schema.safeParse(params.input);

  // Valida antes de confirmar: emitir `requestState` para argumentos que nem
  // passam no schema seria emitir estado para uma chamada que não vai executar.
  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    await log("INVALID_INPUT", auth.agent, issue?.code);

    return failure({
      ok: false,
      code: "invalid_input",
      message: issue?.message ?? "Entrada inválida",
      field: issue?.path.join(".") || undefined,
    });
  }

  const { id } = parsed.data;
  const payload = { tool: params.tool, target: params.target, id };

  try {
    const impact = await describeDeletionImpact(auth.agent.userId, params.target, id);

    if (impact.blockedBy) {
      await log("DOMAIN_ERROR", auth.agent, "invalid_operation");

      return failure({
        ok: false,
        code: "invalid_operation",
        message: impact.blockedBy,
      });
    }

    const { confirmed } = readConfirmation(params.ctx, payload);

    if (!confirmed) {
      await log("CONFIRM_REQUIRED", auth.agent);

      return requestConfirmation(params.ctx, payload, impact);
    }

    await params.run(auth.agent, id);
    await log("OK", auth.agent, null, [id]);

    revalidate(params.revalidates);

    return jsonResult({
      ok: true,
      data: { removed: deletionImpactDto(impact) },
    });
  } catch (error) {
    const { failure: toolFailure, verdict } = classify(error);

    await log(verdict, auth.agent, toolFailure.code);

    return failure(toolFailure);
  }
}
