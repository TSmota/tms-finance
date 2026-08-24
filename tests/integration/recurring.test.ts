import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { recomputeBalance } from "@/lib/accountBalance";
import { listCardInvoices, listInvoiceItems } from "@/lib/invoices";
import { updateCardPurchase } from "@/lib/cardPurchases";
import {
  confirmPendingTransaction,
  createRecurringExpense,
  deleteRecurringExpense,
  listPendingOccurrences,
  listRecurringExpenses,
  materializeRecurring,
  setRecurringActive,
  updateRecurringExpense,
} from "@/lib/recurring";
import { getBalanceProjection } from "@/lib/projection";
import type { RecurringExpenseInput } from "@/lib/validations";
import { makeAccount, makeCategory, makeCreditCard, makeUser } from "../factories";
import { setFxAvailable, setRates } from "../setup-fx";

/**
 * Gastos recorrentes, materialização lazy e projeção.
 *
 * O que estes testes protegem: recorrente em conta gerar pendência que **não**
 * mexe no saldo, recorrente em cartão cair na fatura do ciclo certo, a
 * materialização ser idempotente (inclusive depois de o usuário apagar uma
 * pendência), e a confirmação aplicar o valor real no saldo.
 *
 * `now` é sempre passado explicitamente para `materializeRecurring`: o horizonte
 * futuro é relativo a hoje, e um teste que depende do relógio real quebra
 * sozinho com o passar dos meses.
 */

const NOW = new Date(Date.UTC(2026, 7, 21));

function definition(
  overrides: Partial<RecurringExpenseInput> & { categoryId: string },
): RecurringExpenseInput {
  return {
    description: "Assinatura de teste",
    amount: 39.9,
    currency: "BRL",
    frequency: "MONTHLY",
    dueDay: 10,
    isEstimated: false,
    startDate: "2026-08-01",
    endDate: null,
    accountId: null,
    creditCardId: null,
    ...overrides,
  };
}

/** Lançamentos gerados por uma recorrência, em ordem cronológica. */
async function generated(recurringExpenseId: string) {
  const rows = await prisma.transaction.findMany({
    where: { recurringExpenseId },
    orderBy: { date: "asc" },
  });

  return rows.map((row) => ({
    data: row.date.toISOString().slice(0, 10),
    valor: row.convertedAmount.toFixed(2),
    status: row.status,
    conta: row.accountId !== null,
    cartao: row.creditCardId !== null,
  }));
}

beforeEach(() => {
  setFxAvailable(true);
  setRates({ "USD->BRL": 5.4, "BRL->USD": 0.1852 });
});

describe("materialização em conta bancária", () => {
  it("gera pendência que não mexe no saldo", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, accountId: account.id, amount: 180 }),
    );

    const result = await materializeRecurring(user.id, 2026, 8, NOW);

    expect(result).toEqual({ created: 1, skipped: [] });
    expect(await generated(recurring.id)).toEqual([
      { data: "2026-08-10", valor: "180.00", status: "PENDING", conta: true, cartao: false },
    ]);

    const stored = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
    });

    expect(stored.currentBalance.toFixed(2)).toBe("1000.00");
    // Uma pendência também não entra no recálculo, que só soma confirmados.
    expect((await recomputeBalance(account.id)).toFixed(2)).toBe("1000.00");
  });

  it("materializar duas vezes não duplica nada", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, accountId: account.id }),
    );

    expect((await materializeRecurring(user.id, 2026, 8, NOW)).created).toBe(1);
    expect((await materializeRecurring(user.id, 2026, 8, NOW)).created).toBe(0);
    expect((await materializeRecurring(user.id, 2026, 8, NOW)).created).toBe(0);

    expect(await generated(recurring.id)).toHaveLength(1);
  });

  it("preenche os meses entre o início e a competência pedida, sem buracos", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({
        categoryId: category.id,
        accountId: account.id,
        startDate: "2026-06-01",
        dueDay: 15,
      }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);

    expect(await generated(recurring.id)).toEqual([
      { data: "2026-06-15", valor: "39.90", status: "PENDING", conta: true, cartao: false },
      { data: "2026-07-15", valor: "39.90", status: "PENDING", conta: true, cartao: false },
      { data: "2026-08-15", valor: "39.90", status: "PENDING", conta: true, cartao: false },
    ]);
  });

  it("não ressuscita uma pendência que o usuário apagou", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, accountId: account.id }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);
    await prisma.transaction.deleteMany({ where: { recurringExpenseId: recurring.id } });

    // O marcador `lastGeneratedAt` já cobre agosto: nada volta.
    expect((await materializeRecurring(user.id, 2026, 8, NOW)).created).toBe(0);
    expect(await generated(recurring.id)).toEqual([]);

    // Mas setembro, ainda não coberto, continua sendo gerado.
    expect((await materializeRecurring(user.id, 2026, 9, NOW)).created).toBe(1);
  });

  it("converte para a moeda da conta quando a recorrência é em outra moeda", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { currency: "BRL" });
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({
        categoryId: category.id,
        accountId: account.id,
        amount: 15,
        currency: "USD",
      }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);

    const [occurrence] = await prisma.transaction.findMany({
      where: { recurringExpenseId: recurring.id },
    });

    expect(occurrence!.amount.toFixed(2)).toBe("15.00");
    expect(occurrence!.exchangeRate.toFixed(4)).toBe("5.4000");
    expect(occurrence!.convertedAmount.toFixed(2)).toBe("81.00");
  });

  it("recorrência desativada não gera o ciclo seguinte", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, accountId: account.id }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);
    await setRecurringActive(user.id, recurring.id, false);

    expect((await materializeRecurring(user.id, 2026, 9, NOW)).created).toBe(0);
    expect(await generated(recurring.id)).toHaveLength(1);
  });

  it("respeita a data final da recorrência", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({
        categoryId: category.id,
        accountId: account.id,
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        dueDay: 10,
      }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);

    expect(await generated(recurring.id)).toEqual([
      { data: "2026-06-10", valor: "39.90", status: "PENDING", conta: true, cartao: false },
      { data: "2026-07-10", valor: "39.90", status: "PENDING", conta: true, cartao: false },
    ]);
  });

  it("ignora competência fora do horizonte futuro", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, accountId: account.id }),
    );

    // 2099 está muito além do limite; a janela é cortada em agosto de 2027.
    await materializeRecurring(user.id, 2099, 1, NOW);

    const rows = await generated(recurring.id);

    expect(rows).toHaveLength(13);
    expect(rows[0]!.data).toBe("2026-08-10");
    expect(rows[12]!.data).toBe("2027-08-10");
  });

  it("não gera nada quando o câmbio está indisponível, e tenta de novo depois", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { currency: "BRL" });
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({
        categoryId: category.id,
        accountId: account.id,
        currency: "USD",
        description: "Servidor",
      }),
    );

    setFxAvailable(false);

    // Não lança: a materialização roda durante a renderização da página.
    expect(await materializeRecurring(user.id, 2026, 8, NOW)).toEqual({
      created: 0,
      skipped: ["Servidor"],
    });
    expect(await generated(recurring.id)).toEqual([]);

    setFxAvailable(true);

    expect((await materializeRecurring(user.id, 2026, 8, NOW)).created).toBe(1);
  });
});

describe("materialização no cartão de crédito", () => {
  it("cai na fatura do ciclo e soma no total", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "500.00" });
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({
        categoryId: category.id,
        creditCardId: card.id,
        amount: 39.9,
        dueDay: 10,
        startDate: "2026-07-01",
      }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);

    expect(await generated(recurring.id)).toEqual([
      { data: "2026-07-10", valor: "39.90", status: "CONFIRMED", conta: false, cartao: true },
      { data: "2026-08-10", valor: "39.90", status: "CONFIRMED", conta: false, cartao: true },
    ]);

    const invoices = await listCardInvoices(user.id, card.id);

    expect(
      invoices.map((invoice) => `${invoice.year}-${invoice.month}: ${invoice.total.toFixed(2)}`),
    ).toEqual(["2026-8: 39.90", "2026-7: 39.90"]);

    // Cobrança no cartão não move o saldo da conta.
    expect((await recomputeBalance(account.id)).toFixed(2)).toBe("500.00");
  });

  it("vencimento depois do fechamento entra na fatura seguinte", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });
    const category = await makeCategory(user.id);

    await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, creditCardId: card.id, dueDay: 25 }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);

    const invoices = await listCardInvoices(user.id, card.id);

    // Cobrança dia 25 de agosto, com fechamento dia 20: fatura de setembro.
    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.year).toBe(2026);
    expect(invoices[0]!.month).toBe(9);
    expect(invoices[0]!.total.toFixed(2)).toBe("39.90");
  });

  it("materializar duas vezes não duplica o item nem infla a fatura", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);
    const category = await makeCategory(user.id);

    await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, creditCardId: card.id }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);
    await materializeRecurring(user.id, 2026, 8, NOW);

    const invoices = await listCardInvoices(user.id, card.id);

    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.itemCount).toBe(1);
    expect(invoices[0]!.total.toFixed(2)).toBe("39.90");
  });
});

describe("confirmação da pendência", () => {
  async function pendingSetup() {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);

    await createRecurringExpense(
      user.id,
      definition({
        categoryId: category.id,
        accountId: account.id,
        amount: 180,
        isEstimated: true,
        description: "Conta de luz",
      }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);

    const [pending] = await listPendingOccurrences(user.id, 2026, 8);

    return { user, account, pending: pending! };
  }

  it("aplica o valor confirmado, não o estimado", async () => {
    const { user, account, pending } = await pendingSetup();

    expect(pending.convertedAmount).toBe(180);
    expect(pending.isEstimated).toBe(true);

    await confirmPendingTransaction(user.id, pending.id, {
      amount: 203.47,
      date: "2026-08-11",
      manualFxRate: null,
    });

    const confirmed = await prisma.transaction.findUniqueOrThrow({ where: { id: pending.id } });

    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.amount.toFixed(2)).toBe("203.47");
    expect(confirmed.convertedAmount.toFixed(2)).toBe("203.47");
    expect(confirmed.date.toISOString().slice(0, 10)).toBe("2026-08-11");

    const stored = await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });

    expect(stored.currentBalance.toFixed(2)).toBe("796.53");
    expect((await recomputeBalance(account.id)).toFixed(2)).toBe("796.53");
  });

  it("sai da lista de pendências depois de confirmada", async () => {
    const { user, pending } = await pendingSetup();

    await confirmPendingTransaction(user.id, pending.id, {
      amount: 180,
      date: "2026-08-10",
      manualFxRate: null,
    });

    expect(await listPendingOccurrences(user.id, 2026, 8)).toEqual([]);
  });

  it("confirmar duas vezes é rejeitado e não debita de novo", async () => {
    const { user, account, pending } = await pendingSetup();

    const input = { amount: 180, date: "2026-08-10", manualFxRate: null };

    await confirmPendingTransaction(user.id, pending.id, input);
    await expect(confirmPendingTransaction(user.id, pending.id, input)).rejects.toThrow(
      InvalidOperationError,
    );

    const stored = await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });

    expect(stored.currentBalance.toFixed(2)).toBe("820.00");
  });

  it("duas confirmações simultâneas debitam a conta uma única vez", async () => {
    // A checagem de status acontece fora da transação: sem o update condicional
    // em `status: PENDING`, as duas passam por ela e aplicam o valor em dobro.
    const { user, account, pending } = await pendingSetup();

    const input = { amount: 180, date: "2026-08-10", manualFxRate: null };

    const results = await Promise.allSettled([
      confirmPendingTransaction(user.id, pending.id, input),
      confirmPendingTransaction(user.id, pending.id, input),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);

    const stored = await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });

    expect(stored.currentBalance.toFixed(2)).toBe("820.00");
    expect((await recomputeBalance(account.id)).toFixed(2)).toBe("820.00");
  });

  it("pendência de outro usuário é inacessível", async () => {
    const { pending } = await pendingSetup();
    const intruder = await makeUser();

    await expect(
      confirmPendingTransaction(intruder.id, pending.id, {
        amount: 1,
        date: "2026-08-10",
        manualFxRate: null,
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("projeção de saldo", () => {
  it("soma saldo atual, pendências e faturas em aberto", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });
    const category = await makeCategory(user.id);

    // Pendência em conta: 180 a sair.
    await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, accountId: account.id, amount: 180 }),
    );
    // Cobrança no cartão: 39,90 na fatura de agosto, que vence em setembro.
    await createRecurringExpense(
      user.id,
      definition({
        categoryId: category.id,
        creditCardId: card.id,
        amount: 39.9,
        description: "Streaming",
      }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);

    const august = await getBalanceProjection(user.id, 2026, 8, "BRL");

    // A fatura de agosto vence em 05/09, fora do horizonte de agosto.
    expect(august.currentBalance).toBe(1000);
    expect(august.pendingExpenses).toBe(180);
    expect(august.unpaidInvoices).toBe(0);
    expect(august.projectedBalance).toBe(820);
    expect(august.pendingCount).toBe(1);
    expect(august.complete).toBe(true);

    const september = await getBalanceProjection(user.id, 2026, 9, "BRL");

    // Em setembro a fatura já venceu e a pendência de setembro ainda não foi
    // materializada: 1000 − 180 (agosto, não confirmada) − 39,90 de fatura.
    expect(september.unpaidInvoices).toBe(39.9);
    expect(september.projectedBalance).toBe(780.1);
  });

  it("converte contas em outra moeda para a moeda base", async () => {
    const user = await makeUser({ baseCurrency: "BRL" });
    await makeAccount(user.id, { initialBalance: "1000.00", currency: "BRL" });
    await makeAccount(user.id, { initialBalance: "100.00", currency: "USD" });

    const projection = await getBalanceProjection(user.id, 2026, 8, "BRL");

    expect(projection.currentBalance).toBe(1540);
    expect(projection.complete).toBe(true);
  });

  it("marca a projeção como incompleta quando falta cotação", async () => {
    const user = await makeUser({ baseCurrency: "BRL" });
    await makeAccount(user.id, { initialBalance: "1000.00", currency: "BRL" });
    await makeAccount(user.id, { initialBalance: "100.00", currency: "EUR" });

    const projection = await getBalanceProjection(user.id, 2026, 8, "BRL");

    // Sem cotação de EUR: o total sai parcial e sinalizado, nunca errado.
    expect(projection.currentBalance).toBe(1000);
    expect(projection.complete).toBe(false);
  });

  // Em base USD é a conta em real que passa pela conversão — inclusive a
  // pendência que sai dela.
  it("projeta saldo em base não-BRL, pendência incluída", async () => {
    const user = await makeUser({ baseCurrency: "USD" });
    const brl = await makeAccount(user.id, { initialBalance: "1000.00", currency: "BRL" });
    await makeAccount(user.id, { initialBalance: "100.00", currency: "USD" });
    const category = await makeCategory(user.id);

    await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, accountId: brl.id, amount: 180 }),
    );
    await materializeRecurring(user.id, 2026, 8, NOW);

    const projection = await getBalanceProjection(user.id, 2026, 8, "USD");

    // (1000 × 0,1852) + 100 = 285,20 de saldo; R$ 180 pendentes → US$ 33,336.
    expect(projection.currentBalance).toBeCloseTo(285.2, 2);
    expect(projection.pendingExpenses).toBeCloseTo(33.336, 3);
    expect(projection.projectedBalance).toBeCloseTo(251.864, 3);
    expect(projection.pendingCount).toBe(1);
    expect(projection.complete).toBe(true);
  });

  it("em base não-BRL, conta sem cotação sai da projeção e a marca parcial", async () => {
    const user = await makeUser({ baseCurrency: "USD" });
    await makeAccount(user.id, { initialBalance: "1000.00", currency: "BRL" });
    await makeAccount(user.id, { initialBalance: "100.00", currency: "USD" });
    // Sem `BRL->USD`: o real é que fica sem cotação quando a base é dólar.
    setRates({ "USD->BRL": 5.4 });

    const projection = await getBalanceProjection(user.id, 2026, 8, "USD");

    expect(projection.currentBalance).toBeCloseTo(100, 2);
    expect(projection.projectedBalance).toBeCloseTo(100, 2);
    expect(projection.complete).toBe(false);
  });

  it("não vê pendências de outro usuário", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const account = await makeAccount(other.id, { initialBalance: "500.00" });
    const category = await makeCategory(other.id);

    await createRecurringExpense(
      other.id,
      definition({ categoryId: category.id, accountId: account.id }),
    );
    await materializeRecurring(other.id, 2026, 8, NOW);

    const projection = await getBalanceProjection(user.id, 2026, 8, "BRL");

    expect(projection).toMatchObject({
      currentBalance: 0,
      pendingExpenses: 0,
      projectedBalance: 0,
      pendingCount: 0,
    });
    expect(await listPendingOccurrences(user.id, 2026, 8)).toEqual([]);
  });
});

describe("definições", () => {
  it("exige exatamente um destino", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const card = await makeCreditCard(user.id);
    const category = await makeCategory(user.id);

    await expect(
      createRecurringExpense(user.id, definition({ categoryId: category.id })),
    ).rejects.toThrow(InvalidOperationError);

    await expect(
      createRecurringExpense(
        user.id,
        definition({ categoryId: category.id, accountId: account.id, creditCardId: card.id }),
      ),
    ).rejects.toThrow(InvalidOperationError);
  });

  it("recusa categoria, conta ou cartão de outro usuário", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const category = await makeCategory(user.id);
    const foreignAccount = await makeAccount(other.id);
    const foreignCategory = await makeCategory(other.id);
    const account = await makeAccount(user.id);

    await expect(
      createRecurringExpense(
        user.id,
        definition({ categoryId: category.id, accountId: foreignAccount.id }),
      ),
    ).rejects.toThrow(NotFoundError);

    await expect(
      createRecurringExpense(
        user.id,
        definition({ categoryId: foreignCategory.id, accountId: account.id }),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejeita data final anterior à inicial", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const category = await makeCategory(user.id);

    await expect(
      createRecurringExpense(
        user.id,
        definition({
          categoryId: category.id,
          accountId: account.id,
          startDate: "2026-08-01",
          endDate: "2026-07-31",
        }),
      ),
    ).rejects.toThrow(InvalidOperationError);
  });

  it("editar não reescreve as ocorrências já geradas", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, accountId: account.id, amount: 100 }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);

    await updateRecurringExpense(
      user.id,
      recurring.id,
      definition({ categoryId: category.id, accountId: account.id, amount: 250 }),
    );

    // Agosto fica com o valor projetado na época; setembro já nasce com o novo.
    await materializeRecurring(user.id, 2026, 9, NOW);

    expect((await generated(recurring.id)).map((row) => row.valor)).toEqual([
      "100.00",
      "250.00",
    ]);
  });

  it("apagar remove o que não foi liquidado e mantém o histórico", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({
        categoryId: category.id,
        accountId: account.id,
        startDate: "2026-07-01",
        amount: 100,
      }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);

    const pending = await listPendingOccurrences(user.id, 2026, 8);

    expect(pending).toHaveLength(2);

    // Confirma julho; agosto fica pendente.
    await confirmPendingTransaction(user.id, pending[0]!.id, {
      amount: 100,
      date: "2026-07-10",
      manualFxRate: null,
    });

    await deleteRecurringExpense(user.id, recurring.id);

    const remaining = await prisma.transaction.findMany({ where: { userId: user.id } });

    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.status).toBe("CONFIRMED");
    // Sem vínculo com a recorrência apagada, mas o saldo continua batendo.
    expect(remaining[0]!.recurringExpenseId).toBeNull();
    expect((await recomputeBalance(account.id)).toFixed(2)).toBe("900.00");
  });

  it("apagar remove o item de uma fatura em aberto e recalcula o total", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, creditCardId: card.id }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);
    await deleteRecurringExpense(user.id, recurring.id);

    const invoices = await listCardInvoices(user.id, card.id);

    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.itemCount).toBe(0);
    expect(invoices[0]!.total.toFixed(2)).toBe("0.00");
  });

  it("lista com inativas no fim", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { name: "Conta" });
    const category = await makeCategory(user.id, { name: "Casa" });

    const zeta = await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, accountId: account.id, description: "Zeta" }),
    );
    await createRecurringExpense(
      user.id,
      definition({ categoryId: category.id, accountId: account.id, description: "Água" }),
    );

    await setRecurringActive(user.id, zeta.id, false);

    const list = await listRecurringExpenses(user.id);

    expect(list.map((item) => item.description)).toEqual(["Água", "Zeta"]);
    expect(list.map((item) => item.active)).toEqual([true, false]);
    expect(list[0]!.accountName).toBe("Conta");
    expect(list[0]!.categoryName).toBe("Casa");
  });

  it("recorrência de outro usuário é inacessível", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const account = await makeAccount(other.id);
    const category = await makeCategory(other.id);

    const recurring = await createRecurringExpense(
      other.id,
      definition({ categoryId: category.id, accountId: account.id }),
    );

    await expect(deleteRecurringExpense(user.id, recurring.id)).rejects.toThrow(NotFoundError);
    await expect(setRecurringActive(user.id, recurring.id, false)).rejects.toThrow(NotFoundError);
    expect(await listRecurringExpenses(user.id)).toEqual([]);
  });
});

describe("ajuste do valor real de uma cobrança no cartão", () => {
  async function cardSetup() {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });
    const category = await makeCategory(user.id);

    const recurring = await createRecurringExpense(
      user.id,
      definition({
        categoryId: category.id,
        creditCardId: card.id,
        amount: 39.9,
        isEstimated: true,
        description: "Streaming",
      }),
    );

    await materializeRecurring(user.id, 2026, 8, NOW);

    const [invoice] = await listCardInvoices(user.id, card.id);
    const [item] = await listInvoiceItems(user.id, invoice!.id);

    return { user, card, category, recurring, item: item! };
  }

  /** Entrada de compra equivalente à cobrança gerada, com o valor ajustado. */
  function adjusted(cardId: string, categoryId: string, amount: number) {
    return {
      creditCardId: cardId,
      categoryId,
      description: "Streaming",
      amount,
      currency: "BRL" as const,
      date: "2026-08-10",
      installments: 1,
      manualFxRate: null,
    };
  }

  it("a listagem marca a cobrança como vinda de um recorrente", async () => {
    const { item } = await cardSetup();

    expect(item.fromRecurring).toBe(true);
    expect(item.groupTotal).toBe(39.9);
  });

  it("ajustar o valor atualiza a fatura e preserva o vínculo com a recorrência", async () => {
    const { user, card, category, recurring, item } = await cardSetup();

    await updateCardPurchase(user.id, item.id, adjusted(card.id, category.id, 47.5));

    const rows = await prisma.transaction.findMany({ where: { userId: user.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.convertedAmount.toFixed(2)).toBe("47.50");
    expect(rows[0]!.recurringExpenseId).toBe(recurring.id);

    const [invoice] = await listCardInvoices(user.id, card.id);

    expect(invoice!.total.toFixed(2)).toBe("47.50");
  });

  it("o valor ajustado não é desfeito por uma nova materialização", async () => {
    const { user, card, category, item } = await cardSetup();

    await updateCardPurchase(user.id, item.id, adjusted(card.id, category.id, 47.5));

    // O marcador já cobre agosto, e o índice único cobriria o resto.
    expect((await materializeRecurring(user.id, 2026, 8, NOW)).created).toBe(0);

    const [invoice] = await listCardInvoices(user.id, card.id);

    expect(invoice!.total.toFixed(2)).toBe("47.50");
  });

  it("recusa mover a cobrança para a data de outra ocorrência da mesma recorrência", async () => {
    const { user, card, category, item } = await cardSetup();

    // Setembro materializa a ocorrência de 10/09.
    await materializeRecurring(user.id, 2026, 9, NOW);

    await expect(
      updateCardPurchase(user.id, item.id, {
        ...adjusted(card.id, category.id, 47.5),
        date: "2026-09-10",
      }),
    ).rejects.toThrow(InvalidOperationError);

    // A tentativa recusada não apagou nada.
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(2);
  });

  it("parcelar a cobrança ajustada mantém a recorrência só na primeira parcela", async () => {
    const { user, card, category, recurring, item } = await cardSetup();

    await updateCardPurchase(user.id, item.id, {
      ...adjusted(card.id, category.id, 90),
      installments: 3,
    });

    const rows = await prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { installmentNumber: "asc" },
    });

    // Todas as parcelas carregam a mesma data, e o índice único
    // `(recurring_expense_id, date)` recusaria mais de uma com o vínculo.
    expect(rows.map((row) => row.recurringExpenseId)).toEqual([recurring.id, null, null]);
    expect(rows.map((row) => row.convertedAmount.toFixed(2))).toEqual([
      "30.00",
      "30.00",
      "30.00",
    ]);
  });
});
