import { describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { createTransaction } from "@/lib/transactions";
import { transactionSchema } from "@/lib/validations";
import { runTool } from "@/mcp/guard";
import { makeAccount, makeCategory, makeUser } from "../factories";
import { setFxAvailable, setRates } from "../setup-fx";
import { auditFor, ctxFor, makeAgent, readResult } from "../mcpHarness";

/**
 * Câmbio indisponível não é falha do agente — é um pedido de mais informação.
 *
 * Falta de cotação nunca produz número errado: quem escreve levanta
 * `FxUnavailableError`, e a action traduz em
 * `needsManualFxRate` para o formulário pedir a taxa. Aqui o análogo é
 * `retry: { with: ["manualFxRate"] }` — o contrato tem de dizer o que mudar, e
 * nomear o campo **que existe de verdade**, ou o agente tenta um campo
 * inventado e desiste.
 */
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

async function scenario() {
  const user = await makeUser({ baseCurrency: "BRL" });
  const account = await makeAccount(user.id, { currency: "BRL", initialBalance: "1000.00" });
  const category = await makeCategory(user.id);
  const agent = await makeAgent(user.id, ["transactions:write"]);

  return { user, account, category, ctx: ctxFor(agent, "BRL") };
}

/** Gasto em USD numa conta BRL: precisa de conversão para mover o saldo. */
function foreignExpense(accountId: string, manualFxRate: number | null) {
  return {
    accountId,
    categoryId: null,
    type: "EXPENSE" as const,
    amount: 100,
    currency: "USD" as const,
    date: "2026-08-15",
    description: "Compra em dólar",
    manualFxRate,
  };
}

function call(ctx: ReturnType<typeof ctxFor>, input: unknown) {
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

describe("cotação indisponível", () => {
  it("devolve fx_unavailable dizendo qual campo reenviar, e não escreve nada", async () => {
    const { account, ctx } = await scenario();

    setFxAvailable(false);

    const result = await call(ctx, foreignExpense(account.id, null));
    const payload = readResult(result);

    expect(payload.code).toBe("fx_unavailable");
    expect(payload.retry).toEqual({ with: ["manualFxRate"] });

    // Nada gravado: melhor recusar que gravar um valor sem conversão.
    expect(await prisma.transaction.count()).toBe(0);

    const [entry] = await auditFor("create_transaction");

    expect(entry.verdict).toBe("FX_UNAVAILABLE");
  });

  /**
   * O campo do `retry` tem de ser o do schema real. Se o nome divergir, o
   * agente reenvia algo que o Zod ignora e a segunda tentativa falha igual —
   * um loop silencioso. Este teste amarra os dois.
   */
  it("o retry nomeia um campo que o schema aceita — a segunda tentativa passa", async () => {
    const { account, ctx } = await scenario();

    setFxAvailable(false);

    const first = readResult(await call(ctx, foreignExpense(account.id, null)));
    const field = (first.retry as { with: string[] }).with[0];

    expect(field).toBe("manualFxRate");

    // Reenvia usando exatamente o campo que o erro pediu.
    const retried = readResult(
      await call(ctx, { ...foreignExpense(account.id, null), [field]: 5 }),
    );

    expect(retried.ok).toBe(true);

    const row = await prisma.transaction.findFirstOrThrow();

    expect(row.amount.toFixed(2)).toBe("100.00");
    // A invariante por linha: amount × exchangeRate = convertedAmount.
    expect(row.exchangeRate.toFixed(4)).toBe("5.0000");
    expect(row.convertedAmount.toFixed(2)).toBe("500.00");

    const account2 = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { currentBalance: true },
    });

    expect(account2.currentBalance.toFixed(2)).toBe("500.00");
  });

  it("com cotação disponível, converte sem pedir nada", async () => {
    const { account, ctx } = await scenario();

    setRates({ "USD->BRL": 5.5 });

    const payload = readResult(await call(ctx, foreignExpense(account.id, null)));

    expect(payload.ok).toBe(true);

    const row = await prisma.transaction.findFirstOrThrow();

    expect(row.convertedAmount.toFixed(2)).toBe("550.00");
  });
});
