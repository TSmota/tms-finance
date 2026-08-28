import type { ServerContext } from "@modelcontextprotocol/server";

import { prisma } from "@/lib/db";
import type { AgentScope } from "@/lib/agentScopes";
import type { AgentVerdict } from "@/lib/agentAudit";
import { mintAgentToken } from "@/lib/agentTokens";

/**
 * Andaime para exercitar a casca MCP contra o banco real.
 *
 * Os testes chamam `runTool` / `runDestructiveTool` diretamente, sem levantar
 * transporte: o que precisa de prova aqui é o guard — escopo, validação,
 * confirmação, auditoria, atomicidade. Negociar protocolo testaria o SDK.
 */

export interface Agent {
  userId: string;
  tokenId: string;
  scopes: AgentScope[];
}

/** Emite um token real: a identidade do contexto tem de existir no banco. */
export async function makeAgent(
  userId: string,
  scopes: readonly AgentScope[],
): Promise<Agent> {
  const minted = await mintAgentToken(userId, { label: "harness", scopes });

  return { userId, tokenId: minted.id, scopes: minted.scopes };
}

export interface CtxOptions {
  /** Resposta de elicitação já dada pelo cliente, para a 2ª fase. */
  inputResponses?: Record<string, unknown>;
  /** `requestState` já verificado, como o seam entregaria ao handler. */
  requestState?: unknown;
  method?: string;
}

export function ctxFor(
  agent: Agent,
  baseCurrency: string,
  options: CtxOptions = {},
): ServerContext {
  return {
    mcpReq: {
      method: options.method ?? "tools/call",
      inputResponses: options.inputResponses,
      requestState: <T,>() => options.requestState as T | undefined,
    },
    http: {
      authInfo: {
        token: "hermes_live_harness",
        clientId: agent.tokenId,
        scopes: agent.scopes,
        extra: { userId: agent.userId, baseCurrency },
      },
    },
  } as unknown as ServerContext;
}

/** Contexto sem identidade válida, para o caminho de recusa. */
export function ctxWithoutIdentity(): ServerContext {
  return {
    mcpReq: { method: "tools/call", requestState: () => undefined },
    http: {},
  } as unknown as ServerContext;
}

/**
 * O payload que o agente de fato leria, extraído do `content` textual.
 *
 * Recebe `unknown` porque as ferramentas destrutivas devolvem
 * `CallToolResult | InputRequiredResult`, e um `input_required` não tem
 * `content`.
 */
export function readResult(result: unknown): Record<string, unknown> {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  const text = content?.find((part) => part.type === "text")?.text;

  if (!text) {
    const kind = (result as { resultType?: string }).resultType;

    throw new Error(
      kind
        ? `Resultado é "${kind}", não um resultado de ferramenta — não há content para ler.`
        : "Resultado sem conteúdo textual",
    );
  }

  return JSON.parse(text) as Record<string, unknown>;
}

/** As linhas de auditoria de uma ferramenta, na ordem em que foram gravadas. */
export async function auditFor(tool: string): Promise<
  Array<{ verdict: AgentVerdict; errorCode: string | null; affectedIds: string[] }>
> {
  const rows = await prisma.agentAuditLog.findMany({
    where: { tool },
    orderBy: { createdAt: "asc" },
    select: { verdict: true, errorCode: true, affectedIds: true },
  });

  return rows as Array<{ verdict: AgentVerdict; errorCode: string | null; affectedIds: string[] }>;
}
