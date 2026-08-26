import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SUPPORTED_PROTOCOL_VERSIONS,
  type ServerContext,
} from "@modelcontextprotocol/server";

import type { DeletionImpact } from "@/lib/deletionImpact";
import {
  confirmCodec,
  confirmationMessage,
  readConfirmation,
  requestConfirmation,
  resetConfirmCodec,
  MCP_PROTOCOL_REVISION,
  type ConfirmPayload,
} from "@/mcp/confirm";

/**
 * O teste que carrega o peso da decisão de expor as remoções em cascata.
 *
 * `requestState` volta pelo cliente, então é entrada controlada pelo atacante
 * na reentrada. Cada caso aqui é uma forma de forjar uma confirmação: state de
 * outra ferramenta, de outro id, de outro token, expirado. Se algum passar, a
 * confirmação em duas fases é decorativa.
 *
 * Unitário e não de integração: nada aqui toca o banco. O pepper é injetado no
 * `process.env` do próprio teste, o que só funciona porque o codec é criado na
 * primeira chamada e não no import — ver `confirmCodec`.
 */

const PEPPER = "teste-pepper-com-pelo-menos-32-caracteres-de-comprimento";

/** Contexto mínimo: só o que `bind` e os acessores de MRTR realmente leem. */
function makeCtx(options: {
  clientId?: string;
  method?: string;
  inputResponses?: Record<string, unknown>;
  requestState?: unknown;
}): ServerContext {
  return {
    mcpReq: {
      method: options.method ?? "tools/call",
      inputResponses: options.inputResponses,
      requestState: <T,>() => options.requestState as T | undefined,
    },
    http: { authInfo: { clientId: options.clientId ?? "token-a" } },
  } as unknown as ServerContext;
}

const payload: ConfirmPayload = {
  tool: "delete_account",
  target: "account",
  id: "11111111-1111-1111-1111-111111111111",
};

const impact: DeletionImpact = {
  target: "account",
  id: payload.id,
  label: "Conta Corrente",
  entries: [
    { key: "transactions", label: "lançamentos apagados junto", count: 184, effect: "destroy" },
    {
      key: "invoices_paid_here",
      label: "faturas que perdem o registro de qual conta as pagou",
      count: 6,
      effect: "detach",
    },
  ],
  blockedBy: null,
  oldestRecord: "2024-03-11",
};

/** Aceite do cliente, na forma que o `acceptedContent` reconhece. */
function accepted(confirm: boolean) {
  return { confirm: { action: "accept", content: { confirm } } };
}

beforeEach(() => {
  vi.stubEnv("AGENT_TOKEN_PEPPER", PEPPER);
  vi.stubEnv("AGENT_CONFIRM_TTL_SECONDS", "120");
  resetConfirmCodec();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  resetConfirmCodec();
});

describe("revisão do protocolo", () => {
  it("input_required continua fora do que o initialize negocia", () => {
    // Se isto passar a falhar, o SDK promoveu a revisão: a declaração por
    // requisição deixa de ser necessária e o desenho stateless precisa ser revisto.
    expect(SUPPORTED_PROTOCOL_VERSIONS).not.toContain(MCP_PROTOCOL_REVISION);
  });
});

describe("mensagem de confirmação", () => {
  it("separa o que desaparece do que só perde vínculo", () => {
    const message = confirmationMessage(impact);

    expect(message).toContain('Remover "Conta Corrente" é irreversível.');
    expect(message).toContain("Desaparece de vez:");
    expect(message).toContain("184 lançamentos apagados junto");
    expect(message).toContain("Sobrevive, mas perde o vínculo:");
    expect(message).toContain("6 faturas");
    expect(message).toContain("2024-03-11");
  });

  /**
   * Juntar as duas categorias numa contagem só esconderia qual é qual, e é
   * exatamente a distinção que faz a pergunta valer algo.
   */
  it("não anuncia perda quando nada está vinculado", () => {
    const isolated: DeletionImpact = { ...impact, entries: [], oldestRecord: null };

    expect(confirmationMessage(isolated)).toContain("Nenhum outro registro está vinculado");
  });
});

describe("emissão e verificação do requestState", () => {
  it("aceita o state que ele mesmo emitiu, para a mesma chamada", async () => {
    const ctx = makeCtx({});
    const state = await confirmCodec().mint(payload, ctx);
    const verified = await confirmCodec().verify(state, ctx);

    expect(verified).toEqual(payload);

    const withState = makeCtx({ inputResponses: accepted(true), requestState: verified });

    expect(readConfirmation(withState, payload).confirmed).toBe(true);
  });

  it("recusa state emitido para OUTRO id", async () => {
    const ctx = makeCtx({});
    const other = { ...payload, id: "22222222-2222-2222-2222-222222222222" };
    const verified = await confirmCodec().verify(await confirmCodec().mint(other, ctx), ctx);

    const withState = makeCtx({ inputResponses: accepted(true), requestState: verified });

    expect(readConfirmation(withState, payload).confirmed).toBe(false);
  });

  it("recusa state emitido para OUTRA ferramenta", async () => {
    const ctx = makeCtx({});
    const other: ConfirmPayload = { tool: "delete_person", target: "person", id: payload.id };
    const verified = await confirmCodec().verify(await confirmCodec().mint(other, ctx), ctx);

    const withState = makeCtx({ inputResponses: accepted(true), requestState: verified });

    expect(readConfirmation(withState, payload).confirmed).toBe(false);
  });

  /**
   * O MUST de user-binding da spec: state de um token de agente não pode ser
   * reaproveitado por outro. É o `bind` do codec que garante, e é por isso que
   * ele entra na criação em vez de ser conferido à mão aqui.
   */
  it("recusa state de outro token de agente", async () => {
    const minted = await confirmCodec().mint(payload, makeCtx({ clientId: "token-a" }));

    await expect(
      confirmCodec().verify(minted, makeCtx({ clientId: "token-b" })),
    ).rejects.toThrow();
  });

  it("recusa state reaproveitado fora de tools/call", async () => {
    const minted = await confirmCodec().mint(payload, makeCtx({ method: "tools/call" }));

    await expect(
      confirmCodec().verify(minted, makeCtx({ method: "prompts/get" })),
    ).rejects.toThrow();
  });

  it("recusa state adulterado", async () => {
    const ctx = makeCtx({});
    const minted = await confirmCodec().mint(payload, ctx);
    const tampered = `${minted.slice(0, -4)}AAAA`;

    await expect(confirmCodec().verify(tampered, ctx)).rejects.toThrow();
  });

  it("recusa state expirado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00Z"));

    const ctx = makeCtx({});
    const minted = await confirmCodec().mint(payload, ctx);

    // TTL é 120s; 121 já está fora.
    vi.setSystemTime(new Date("2026-08-21T12:02:01Z"));

    await expect(confirmCodec().verify(minted, ctx)).rejects.toThrow();
  });
});

describe("leitura da resposta do cliente", () => {
  it("exige state: aceite sozinho não confirma", () => {
    const ctx = makeCtx({ inputResponses: accepted(true) });

    expect(readConfirmation(ctx, payload).confirmed).toBe(false);
  });

  it("exige aceite: state sozinho não confirma", () => {
    const ctx = makeCtx({ requestState: payload });

    expect(readConfirmation(ctx, payload).confirmed).toBe(false);
  });

  it("trata recusa explícita do cliente como não confirmado", () => {
    const ctx = makeCtx({ inputResponses: accepted(false), requestState: payload });

    expect(readConfirmation(ctx, payload).confirmed).toBe(false);
  });

  it("trata elicitação cancelada como não confirmado", () => {
    const ctx = makeCtx({
      inputResponses: { confirm: { action: "cancel" } },
      requestState: payload,
    });

    expect(readConfirmation(ctx, payload).confirmed).toBe(false);
  });

  it("não confirma quando o cliente não respondeu nada", () => {
    expect(readConfirmation(makeCtx({}), payload).confirmed).toBe(false);
  });
});

describe("pedido de confirmação", () => {
  it("devolve input_required com a elicitação e o state assinado", async () => {
    const result = await requestConfirmation(makeCtx({}), payload, impact);

    expect(result.resultType).toBe("input_required");
    expect(result.inputRequests?.confirm).toBeDefined();
    expect(typeof result.requestState).toBe("string");

    // O state precisa carregar exatamente esta chamada, ou a segunda fase
    // aceitaria uma remoção diferente da que foi mostrada.
    const decoded = await confirmCodec().verify(result.requestState as string, makeCtx({}));

    expect(decoded).toEqual(payload);
  });
});

describe("configuração ausente", () => {
  it("falha com mensagem acionável quando o pepper é curto demais", () => {
    vi.stubEnv("AGENT_TOKEN_PEPPER", "curto");
    resetConfirmCodec();

    expect(() => confirmCodec()).toThrow(/openssl rand -base64 33/);
  });
});
