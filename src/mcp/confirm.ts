import {
  acceptedContent,
  createRequestStateCodec,
  inputRequired,
  type InputRequiredResult,
  type RequestStateCodec,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";

import type { DeletionImpact, DeletionTarget } from "@/lib/deletionImpact";

/**
 * Confirmação em duas fases para remoção em cascata.
 *
 * O dano irreversível deste app é perda de histórico, não dinheiro:
 * `delete_account` cascateia todos os lançamentos da conta, sem guarda no
 * serviço.
 *
 * Usa o padrão multi-round-trip do protocolo em vez de um parâmetro
 * `confirmationToken` porque assim a pergunta vai ao **cliente**, que pode ter
 * um humano na frente, e não ao agente.
 */

/** O que o state carrega. Verificado pelo codec e conferido contra os args. */
export interface ConfirmPayload {
  tool: string;
  target: DeletionTarget;
  id: string;
}

const DEFAULT_TTL_SECONDS = 120;

function confirmTtlSeconds(): number {
  const raw = process.env.AGENT_CONFIRM_TTL_SECONDS;

  if (!raw) {
    return DEFAULT_TTL_SECONDS;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
}

let cachedCodec: RequestStateCodec<ConfirmPayload> | undefined;

/**
 * O codec, criado na primeira chamada e não no import.
 *
 * No escopo do módulo, `AGENT_TOKEN_PEPPER` seria lido e congelado no primeiro
 * import — os testes injetam ambiente por project do Vitest.
 */
export function confirmCodec(): RequestStateCodec<ConfirmPayload> {
  if (cachedCodec) {
    return cachedCodec;
  }

  const key = process.env.AGENT_TOKEN_PEPPER;

  // O RangeError do codec não diz como gerar a chave. Esta mensagem diz.
  if (!key || key.length < 32) {
    throw new Error(
      "AGENT_TOKEN_PEPPER ausente ou com menos de 32 caracteres. " +
        "Gere com: openssl rand -base64 33",
    );
  }

  cachedCodec = createRequestStateCodec<ConfirmPayload>({
    key,
    ttlSeconds: confirmTtlSeconds(),
    /**
     * Amarra o state ao principal e ao método: state emitido para um token não
     * serve a outro, nem fora de `tools/call`. Entra no envelope como tag HMAC,
     * então o `clientId` não viaja em claro.
     */
    bind: (ctx) => `${ctx.mcpReq.method}\0${ctx.http?.authInfo?.clientId ?? ""}`,
  });

  return cachedCodec;
}

/** Só existe para dar ao teste um ponto de reset entre casos. */
export function resetConfirmCodec(): void {
  cachedCodec = undefined;
}

/**
 * Esquema da resposta de confirmação.
 *
 * Serve ao `elicit` e ao `acceptedContent`: o valor vem do cliente e o SDK não
 * o valida sozinho.
 */
const confirmResponseSchema = z.object({
  confirm: z.boolean(),
});

/**
 * Monta a pergunta de confirmação a partir do impacto medido.
 *
 * Separa o que **desaparece** do que apenas perde vínculo: numa contagem única
 * não dá para saber qual é qual.
 */
export function confirmationMessage(impact: DeletionImpact): string {
  const destroyed = impact.entries.filter((entry) => entry.effect === "destroy");
  const detached = impact.entries.filter((entry) => entry.effect === "detach");

  const lines: string[] = [`Remover "${impact.label}" é irreversível.`];

  if (destroyed.length > 0) {
    lines.push("", "Desaparece de vez:");
    for (const entry of destroyed) {
      lines.push(`  • ${entry.count} ${entry.label}`);
    }
  }

  if (detached.length > 0) {
    lines.push("", "Sobrevive, mas perde o vínculo:");
    for (const entry of detached) {
      lines.push(`  • ${entry.count} ${entry.label}`);
    }
  }

  if (destroyed.length === 0 && detached.length === 0) {
    lines.push("", "Nenhum outro registro está vinculado a este.");
  }

  if (impact.oldestRecord) {
    lines.push("", `O registro mais antigo alcançado é de ${impact.oldestRecord}.`);
  }

  lines.push("", "Confirma a remoção?");

  return lines.join("\n");
}

/**
 * `confirmed` exige três coisas: o cliente aceitou, o state verificou pelo
 * codec, e o state foi emitido para esta ferramenta e este id. A terceira é
 * conferida aqui — o `bind` do codec cobre principal e método, não os
 * argumentos.
 */
export function readConfirmation(
  ctx: ServerContext,
  expected: ConfirmPayload,
): { confirmed: boolean } {
  const answer = acceptedContent(ctx.mcpReq.inputResponses, "confirm", confirmResponseSchema);

  if (!answer?.confirm) {
    return { confirmed: false };
  }

  const state = ctx.mcpReq.requestState<ConfirmPayload>();

  if (!state) {
    return { confirmed: false };
  }

  const matches =
    state.tool === expected.tool &&
    state.target === expected.target &&
    state.id === expected.id;

  return { confirmed: matches };
}

/** A primeira metade: pede a confirmação, sem executar nada. */
export async function requestConfirmation(
  ctx: ServerContext,
  payload: ConfirmPayload,
  impact: DeletionImpact,
): Promise<InputRequiredResult> {
  return inputRequired({
    inputRequests: {
      confirm: inputRequired.elicit({
        message: confirmationMessage(impact),
        requestedSchema: confirmResponseSchema,
      }),
    },
    requestState: await confirmCodec().mint(payload, ctx),
  });
}
