import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { recomputeBalance } from "@/lib/accountBalance";
import { createTransaction, deleteTransaction } from "@/lib/transactions";
import { transactionSchema } from "@/lib/validations";
import { REVALIDATION_TARGETS } from "@/lib/revalidation";
import { runTool } from "@/mcp/guard";
import { makeAccount, makeCategory, makeUser } from "../factories";
import { setRates } from "../setup-fx";
import { auditFor, ctxFor, ctxWithoutIdentity, makeAgent, readResult } from "../mcpHarness";

/**
 * O guard da casca MCP.
 *
 * Mockar `next/cache` é o único mock de Next em toda a suíte, e é justificado:
 * `revalidatePath` exige um contexto de request do Next que não existe fora do
 * servidor, e o que está sob teste é a fronteira de autorização, não a
 * invalidação de cache. Prisma segue sem mock em lugar nenhum.
 */
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { revalidatePath } = await import("next/cache");

beforeEach(() => {
  setRates({ "USD->BRL": 5 });
  vi.mocked(revalidatePath).mockClear();
});

/** Fixture: usuário com conta e categoria, e um agente com escopo de escrita. */
async function scenario(scopes: readonly ("finance:read" | "transactions:write")[]) {
  const user = await makeUser();
  const account = await makeAccount(user.id, { initialBalance: "1000.00" });
  const category = await makeCategory(user.id);
  const agent = await makeAgent(user.id, scopes);

  return { user, account, category, agent, ctx: ctxFor(agent, "BRL") };
}

function transactionInput(accountId: string, categoryId: string | null) {
  return {
    accountId,
    categoryId,
    type: "EXPENSE" as const,
    amount: 250,
    currency: "BRL" as const,
    date: "2026-08-15",
    description: "Compra de teste",
    manualFxRate: null,
  };
}

function createTool(ctx: ReturnType<typeof ctxFor>, input: unknown) {
  return runTool({
    ctx,
    tool: "create_transaction",
    input,
    schema: transactionSchema,
    run: (agent, parsed) => createTransaction(agent.userId, parsed),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "transactions",
  });
}

describe("escopo", () => {
  it("recusa sem o escopo e NÃO escreve nada", async () => {
    const { account, category, ctx } = await scenario(["finance:read"]);

    const result = await createTool(ctx, transactionInput(account.id, category.id));
    const payload = readResult(result);

    expect(result.isError).toBe(true);
    expect(payload.code).toBe("forbidden_scope");
    expect(String(payload.message)).toContain("transactions:write");

    // "Recusou" sem "e não deixou lixo" não prova nada.
    expect(await prisma.transaction.count()).toBe(0);

    const [entry] = await auditFor("create_transaction");

    expect(entry.verdict).toBe("FORBIDDEN_SCOPE");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("recusa contexto sem identidade", async () => {
    const result = await createTool(ctxWithoutIdentity(), {});
    const payload = readResult(result);

    expect(payload.code).toBe("unauthenticated");
    expect(await prisma.transaction.count()).toBe(0);

    // Sem token válido não há a que vincular a linha — mas ela existe.
    const [entry] = await auditFor("create_transaction");

    expect(entry.verdict).toBe("FORBIDDEN_SCOPE");

    const row = await prisma.agentAuditLog.findFirstOrThrow();

    expect(row.tokenId).toBeNull();
    expect(row.userId).toBeNull();
  });
});

describe("validação", () => {
  it("recusa entrada inválida, aponta o campo e NÃO escreve nada", async () => {
    const { account, ctx } = await scenario(["transactions:write"]);

    const result = await createTool(ctx, {
      ...transactionInput(account.id, null),
      amount: -5,
    });
    const payload = readResult(result);

    expect(payload.code).toBe("invalid_input");
    expect(payload.field).toBe("amount");
    expect(await prisma.transaction.count()).toBe(0);

    const [entry] = await auditFor("create_transaction");

    expect(entry.verdict).toBe("INVALID_INPUT");
  });

  /**
   * O ponto que faz esta integração ser segura sem escrever regra nova: o
   * schema é o mesmo do formulário. Se o agente conseguisse gravar algo que a
   * UI recusa, haveria duas definições de "válido".
   */
  it("usa o mesmo schema do formulário — data inexistente é recusada", async () => {
    const { account, ctx } = await scenario(["transactions:write"]);

    const result = await createTool(ctx, {
      ...transactionInput(account.id, null),
      date: "2026-02-30",
    });

    expect(readResult(result).code).toBe("invalid_input");
    expect(await prisma.transaction.count()).toBe(0);
  });
});

describe("sucesso", () => {
  it("escreve, afirma as DUAS pontas, audita e revalida", async () => {
    const { account, category, ctx } = await scenario(["transactions:write"]);

    const result = await createTool(ctx, transactionInput(account.id, category.id));
    const payload = readResult(result);

    expect(result.isError).toBe(false);
    expect(payload.ok).toBe(true);

    const created = (payload.data as { id: string }).id;

    // Ponta 1: o lançamento existe.
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: created } });

    expect(row.convertedAmount.toFixed(2)).toBe("250.00");

    // Ponta 2: o denormalizado bate com a soma dos lançamentos.
    const account2 = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { currentBalance: true },
    });

    expect(account2.currentBalance.toFixed(2)).toBe("750.00");
    expect((await recomputeBalance(account.id)).toFixed(2)).toBe("750.00");

    // A trilha registra o id, que é o que permite desfazer depois.
    const [entry] = await auditFor("create_transaction");

    expect(entry.verdict).toBe("OK");
    expect(entry.affectedIds).toEqual([created]);

    for (const [path, type] of REVALIDATION_TARGETS.transactions) {
      expect(revalidatePath).toHaveBeenCalledWith(path, type);
    }
  });

  it("nunca alcança dado de outro usuário", async () => {
    const owner = await scenario(["transactions:write"]);
    const stranger = await makeUser({ email: "estranho@test.local" });
    const strangerAccount = await makeAccount(stranger.id, { initialBalance: "500.00" });

    const result = await createTool(
      owner.ctx,
      transactionInput(strangerAccount.id, null),
    );
    const payload = readResult(result);

    // Recurso de outro usuário é indistinguível de inexistente, de propósito.
    expect(payload.code).toBe("not_found");
    expect(await prisma.transaction.count()).toBe(0);
  });
});

describe("erro de domínio", () => {
  it("traduz NotFoundError em not_found sem vazar detalhe interno", async () => {
    const { ctx } = await scenario(["transactions:write"]);

    // UUID bem-formado e inexistente: a recusa tem de vir do domínio, não do
    // Zod. Variante `8` porque `z.uuid()` do Zod 4 valida esse nibble.
    const result = await runTool({
      ctx,
      tool: "delete_transaction",
      input: { id: "11111111-1111-4111-8111-111111111111" },
      schema: z.object({ id: z.uuid() }),
      run: (agent, input) => deleteTransaction(agent.userId, input.id),
      serialize: () => ({ deleted: true }),
      revalidates: "transactions",
    });
    const payload = readResult(result);

    expect(payload.code).toBe("not_found");
    expect(JSON.stringify(payload)).not.toMatch(/prisma|SELECT|constraint/i);

    const [entry] = await auditFor("delete_transaction");

    expect(entry.verdict).toBe("DOMAIN_ERROR");
  });
});

describe("auditoria", () => {
  it("trunca texto livre longo em vez de inflar a trilha", async () => {
    const { account, ctx } = await scenario(["transactions:write"]);

    await createTool(ctx, {
      ...transactionInput(account.id, null),
      description: "x".repeat(2000),
    });

    const row = await prisma.agentAuditLog.findFirstOrThrow({
      where: { tool: "create_transaction" },
      select: { args: true },
    });
    const args = row.args as { description: string };

    expect(args.description.length).toBeLessThan(600);
    expect(args.description).toContain("[truncado]");
  });

  it("grava uma linha por chamada, sempre", async () => {
    const { account, category, ctx } = await scenario(["transactions:write"]);

    await createTool(ctx, transactionInput(account.id, category.id));
    await createTool(ctx, { ...transactionInput(account.id, category.id), amount: -1 });

    const entries = await auditFor("create_transaction");

    expect(entries.map((row) => row.verdict)).toEqual(["OK", "INVALID_INPUT"]);
  });
});
