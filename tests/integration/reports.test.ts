import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { createTransaction } from "@/lib/transactions";
import { createCardPurchase } from "@/lib/cardPurchases";
import { payInvoice } from "@/lib/invoicePayments";
import { listCardInvoices } from "@/lib/invoices";
import { createDebt, settleDebt } from "@/lib/debts";
import { createRecurringExpense, materializeRecurring } from "@/lib/recurring";
import { getDebtsByCategory, getMonthSummary, getOpenInvoices } from "@/lib/reports";
import { money } from "@/lib/money";
import { makeAccount, makeCategory, makeCreditCard, makePerson, makeUser } from "@tests/support/factories";
import { setRates } from "@tests/setup-fx";

/**
 * Agregações do painel.
 *
 * Teste de regressão dos números que o usuário realmente lê.
 *
 * A asserção mais importante é a identidade entre fluxo de caixa e gasto por
 * categoria: `expenses = spendingTotal − cardSpending + invoicePayments`. Ela
 * amarra as duas visões e falha na hora se alguém mudar uma sem a outra.
 */

const YEAR = 2026;
const MONTH = 8;
const NOW = new Date(Date.UTC(2026, 7, 21));

/** Cenário base: conta em BRL, cartão em BRL e uma árvore de categorias. */
async function scenario() {
  const user = await makeUser({ baseCurrency: "BRL" });
  const account = await makeAccount(user.id, { initialBalance: "5000.00", currency: "BRL" });
  const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5, currency: "BRL" });

  const moradia = await makeCategory(user.id, { name: "Moradia", color: "#111111" });
  const luz = await makeCategory(user.id, { name: "Luz", parentId: moradia.id });
  const lazer = await makeCategory(user.id, { name: "Lazer", color: "#444444" });

  return { user, account, card, moradia, luz, lazer };
}

/** Despesa em conta, no mês do cenário. */
function expense(accountId: string, amount: number, categoryId: string | null, day = 10) {
  return {
    accountId,
    categoryId,
    type: "EXPENSE" as const,
    amount,
    currency: "BRL" as const,
    date: `2026-08-${String(day).padStart(2, "0")}`,
    description: "Despesa",
    manualFxRate: null,
  };
}

/** Compra no cartão, no mês do cenário. */
function purchase(creditCardId: string, amount: number, categoryId: string | null, day = 10) {
  return {
    creditCardId,
    categoryId,
    description: "Compra",
    amount,
    currency: "BRL" as const,
    date: `2026-08-${String(day).padStart(2, "0")}`,
    installments: 1,
    manualFxRate: null,
  };
}

/** Fatias em formato compacto. */
function named(slices: Array<{ name: string; value: number }>) {
  return slices.map((slice) => ({ nome: slice.name, valor: slice.value }));
}

beforeEach(() => {
  setRates({ "USD->BRL": 5, "BRL->USD": 0.2 });
});

describe("fluxo de caixa do mês", () => {
  it("soma receitas e despesas confirmadas em conta", async () => {
    const { user, account, lazer } = await scenario();

    await createTransaction(user.id, {
      ...expense(account.id, 8000, null, 5),
      type: "INCOME",
      description: "Salário",
    });
    await createTransaction(user.id, expense(account.id, 450.3, lazer.id));

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    expect(summary.income).toBe(8000);
    expect(summary.expenses).toBe(450.3);
    expect(summary.net).toBe(7549.7);
    expect(summary.complete).toBe(true);
  });

  it("ignora lançamentos de outros meses", async () => {
    const { user, account, lazer } = await scenario();

    await createTransaction(user.id, {
      ...expense(account.id, 100, lazer.id),
      date: "2026-07-31",
    });
    await createTransaction(user.id, {
      ...expense(account.id, 200, lazer.id),
      date: "2026-09-01",
    });
    await createTransaction(user.id, {
      ...expense(account.id, 50, lazer.id),
      date: "2026-08-01",
    });
    await createTransaction(user.id, {
      ...expense(account.id, 70, lazer.id),
      date: "2026-08-31",
    });

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    // Só os dois de agosto: a janela é semiaberta e inclui as duas pontas do mês.
    expect(summary.expenses).toBe(120);
  });

  it("exclui pendências não confirmadas", async () => {
    const { user, account, luz } = await scenario();

    await createRecurringExpense(user.id, {
      description: "Conta de luz",
      amount: 180,
      currency: "BRL",
      frequency: "MONTHLY",
      dueDay: 15,
      isEstimated: true,
      startDate: "2026-08-01",
      endDate: null,
      categoryId: luz.id,
      accountId: account.id,
      creditCardId: null,
    });

    await materializeRecurring(user.id, YEAR, MONTH, NOW);

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    // A pendência projeta saldo, mas não é despesa realizada.
    expect(summary.expenses).toBe(0);
    expect(summary.byCategory).toEqual([]);
  });

  it("não vê lançamentos de outro usuário", async () => {
    const { user, account, lazer } = await scenario();
    const other = await scenario();

    await createTransaction(user.id, expense(account.id, 100, lazer.id));
    await createTransaction(
      other.user.id,
      expense(other.account.id, 999, other.lazer.id),
    );

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    expect(summary.expenses).toBe(100);
  });
});

describe("gasto por categoria", () => {
  it("soma a subcategoria dentro da categoria pai", async () => {
    const { user, account, luz, moradia, lazer } = await scenario();

    await createTransaction(user.id, expense(account.id, 180, luz.id));
    await createTransaction(user.id, expense(account.id, 120, moradia.id));
    await createTransaction(user.id, expense(account.id, 50, lazer.id));

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    expect(named(summary.byCategory)).toEqual([
      { nome: "Moradia", valor: 300 },
      { nome: "Lazer", valor: 50 },
    ]);
    expect(summary.spendingTotal).toBe(350);
  });

  it("agrupa lançamentos sem categoria", async () => {
    const { user, account, lazer } = await scenario();

    await createTransaction(user.id, expense(account.id, 40, null));
    await createTransaction(user.id, expense(account.id, 10, lazer.id));

    expect(named((await getMonthSummary(user.id, YEAR, MONTH, "BRL")).byCategory)).toEqual([
      { nome: "Sem categoria", valor: 40 },
      { nome: "Lazer", valor: 10 },
    ]);
  });

  it("inclui compras no cartão pela categoria da compra, não como sem categoria", async () => {
    const { user, card, lazer, luz } = await scenario();

    await createCardPurchase(user.id, purchase(card.id, 300, lazer.id));
    await createCardPurchase(user.id, purchase(card.id, 200, luz.id));

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    expect(named(summary.byCategory)).toEqual([
      { nome: "Lazer", valor: 300 },
      { nome: "Moradia", valor: 200 },
    ]);
    expect(summary.cardSpending).toBe(500);
    // Compra no cartão não sai da conta.
    expect(summary.expenses).toBe(0);
  });

  it("distribui as parcelas pela data da compra, não pela competência da fatura", async () => {
    const { user, card, lazer } = await scenario();

    await createCardPurchase(user.id, { ...purchase(card.id, 300, lazer.id), installments: 3 });

    const august = await getMonthSummary(user.id, YEAR, MONTH, "BRL");
    const september = await getMonthSummary(user.id, YEAR, 9, "BRL");

    // As três parcelas carregam a data da compra: o gasto aconteceu em agosto.
    expect(august.cardSpending).toBe(300);
    expect(september.cardSpending).toBe(0);
  });

  it("pagamento de fatura entra no fluxo de caixa e fica fora do gasto por categoria", async () => {
    const { user, account, card, lazer } = await scenario();

    await createCardPurchase(user.id, purchase(card.id, 300, lazer.id));

    const [invoice] = await listCardInvoices(user.id, card.id);

    await payInvoice(user.id, invoice!.id, {
      accountId: account.id,
      date: "2026-08-25",
      manualFxRate: null,
    });

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    expect(summary.invoicePayments).toBe(300);
    expect(summary.expenses).toBe(300);
    // O gasto continua atribuído a Lazer, e não duplicado.
    expect(named(summary.byCategory)).toEqual([{ nome: "Lazer", valor: 300 }]);
    expect(summary.spendingTotal).toBe(300);
  });

  it("mantém a identidade entre fluxo de caixa e gasto por categoria", async () => {
    const { user, account, card, lazer, luz } = await scenario();

    await createTransaction(user.id, expense(account.id, 450.3, luz.id));
    await createTransaction(user.id, expense(account.id, 120, null));
    await createCardPurchase(user.id, purchase(card.id, 300, lazer.id));

    const [invoice] = await listCardInvoices(user.id, card.id);

    await payInvoice(user.id, invoice!.id, {
      accountId: account.id,
      date: "2026-08-25",
      manualFxRate: null,
    });

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    // expenses = spendingTotal − cardSpending + invoicePayments
    const identity = money(summary.spendingTotal)
      .minus(summary.cardSpending)
      .plus(summary.invoicePayments);

    expect(identity.toNumber()).toBe(summary.expenses);
    expect(summary.expenses).toBe(870.3);
    expect(summary.spendingTotal).toBe(870.3);
  });
});

describe("multi-moeda nas agregações", () => {
  it("converte conta e cartão em moeda estrangeira para a moeda base", async () => {
    const user = await makeUser({ baseCurrency: "BRL" });
    const brl = await makeAccount(user.id, { currency: "BRL", initialBalance: "1000.00" });
    const usd = await makeAccount(user.id, { currency: "USD", initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id, { currency: "USD", closingDay: 20, dueDay: 5 });
    const lazer = await makeCategory(user.id, { name: "Lazer" });

    await createTransaction(user.id, expense(brl.id, 100, lazer.id));
    // US$ 40 na conta em USD → R$ 200 na moeda base.
    await createTransaction(user.id, {
      ...expense(usd.id, 40, lazer.id),
      currency: "USD",
    });
    // US$ 20 no cartão em USD → R$ 100.
    await createCardPurchase(user.id, {
      ...purchase(card.id, 20, lazer.id),
      currency: "USD",
    });

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    expect(summary.expenses).toBe(300);
    expect(summary.cardSpending).toBe(100);
    expect(named(summary.byCategory)).toEqual([{ nome: "Lazer", valor: 400 }]);
    expect(summary.complete).toBe(true);
  });

  it("marca como incompleto e deixa fora o que não tem cotação", async () => {
    const user = await makeUser({ baseCurrency: "BRL" });
    const brl = await makeAccount(user.id, { currency: "BRL" });
    const eur = await makeAccount(user.id, { currency: "EUR" });
    const lazer = await makeCategory(user.id, { name: "Lazer" });

    await createTransaction(user.id, expense(brl.id, 100, lazer.id));
    await createTransaction(user.id, { ...expense(eur.id, 50, lazer.id), currency: "EUR" });

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    // Melhor um total honestamente parcial que um total errado.
    expect(summary.expenses).toBe(100);
    expect(summary.complete).toBe(false);
  });
});

describe("faturas em aberto", () => {
  it("soma as faturas não pagas de todos os cartões", async () => {
    const { user, card, lazer } = await scenario();
    const other = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(user.id, { ...purchase(card.id, 300, lazer.id), installments: 3 });
    await createCardPurchase(user.id, purchase(other.id, 50, lazer.id));

    const open = await getOpenInvoices(user.id, "BRL");

    expect(open.total).toBe(350);
    expect(open.count).toBe(4);
    expect(open.nextDueDate?.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(open.complete).toBe(true);
  });

  it("fatura paga sai do total", async () => {
    const { user, account, card, lazer } = await scenario();

    await createCardPurchase(user.id, purchase(card.id, 300, lazer.id));

    const [invoice] = await listCardInvoices(user.id, card.id);

    await payInvoice(user.id, invoice!.id, {
      accountId: account.id,
      date: "2026-09-05",
      manualFxRate: null,
    });

    expect(await getOpenInvoices(user.id, "BRL")).toMatchObject({ total: 0, count: 0 });
  });

  it("fatura zerada não conta como dívida", async () => {
    const { user, card } = await scenario();

    // Uma fatura existe, mas sem lançamento nenhum depois da remoção.
    await createCardPurchase(user.id, purchase(card.id, 100, null));
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.invoice.updateMany({ where: { userId: user.id }, data: { totalAmount: "0.00" } });

    expect(await getOpenInvoices(user.id, "BRL")).toMatchObject({
      total: 0,
      count: 0,
      nextDueDate: null,
    });
  });

  it("converte fatura em moeda estrangeira", async () => {
    const user = await makeUser({ baseCurrency: "BRL" });
    const card = await makeCreditCard(user.id, { currency: "USD", closingDay: 20, dueDay: 5 });

    await createCardPurchase(user.id, { ...purchase(card.id, 40, null), currency: "USD" });

    expect(await getOpenInvoices(user.id, "BRL")).toMatchObject({ total: 200, complete: true });
  });
});

describe("dívidas por categoria de origem", () => {
  async function withDebts() {
    const { user, account, lazer, moradia, luz } = await scenario();
    const alice = await makePerson(user.id, { name: "Alice" });
    const bob = await makePerson(user.id, { name: "Bob" });

    const trip = await createDebt(user.id, {
      personId: alice.id,
      categoryId: lazer.id,
      type: "LENT",
      description: "Viagem",
      amount: 200,
      currency: "BRL",
      accountId: account.id,
      date: "2026-08-06",
      dueDate: null,
      manualFxRate: null,
    });

    await settleDebt(user.id, trip.id, {
      amount: 80,
      currency: "BRL",
      accountId: account.id,
      date: "2026-08-16",
      categoryId: null,
      description: null,
      manualFxRate: null,
    });

    // Segunda dívida a receber, numa subcategoria: deve rolar para Moradia.
    await createDebt(user.id, {
      personId: bob.id,
      categoryId: luz.id,
      type: "LENT",
      description: "Conta de luz dividida",
      amount: 90,
      currency: "BRL",
      accountId: account.id,
      date: "2026-08-07",
      dueDate: null,
      manualFxRate: null,
    });

    // Dívida a pagar.
    await createDebt(user.id, {
      personId: bob.id,
      categoryId: moradia.id,
      type: "BORROWED",
      description: "Aluguel adiantado",
      amount: 500,
      currency: "BRL",
      accountId: account.id,
      date: "2026-08-08",
      dueDate: null,
      manualFxRate: null,
    });

    return { user };
  }

  it("separa a receber e a pagar, com rollup de subcategoria", async () => {
    const { user } = await withDebts();

    const result = await getDebtsByCategory(user.id, "BRL");

    expect(named(result.receivable)).toEqual([
      { nome: "Lazer", valor: 120 },
      { nome: "Moradia", valor: 90 },
    ]);
    expect(named(result.payable)).toEqual([{ nome: "Moradia", valor: 500 }]);
    expect(result.receivableTotal).toBe(210);
    expect(result.payableTotal).toBe(500);
    expect(result.complete).toBe(true);
  });

  it("usa o restante, não o valor original", async () => {
    const { user } = await withDebts();

    const result = await getDebtsByCategory(user.id, "BRL");
    const lazer = result.receivable.find((slice) => slice.name === "Lazer");

    // 200 emprestados − 80 recebidos.
    expect(lazer!.value).toBe(120);
  });

  it("dívida quitada sai do corte", async () => {
    const { user, account, lazer } = await scenario();
    const person = await makePerson(user.id);

    const debt = await createDebt(user.id, {
      personId: person.id,
      categoryId: lazer.id,
      type: "LENT",
      description: "Quitada",
      amount: 100,
      currency: "BRL",
      accountId: account.id,
      date: "2026-08-01",
      dueDate: null,
      manualFxRate: null,
    });

    await settleDebt(user.id, debt.id, {
      amount: 100,
      currency: "BRL",
      accountId: account.id,
      date: "2026-08-02",
      categoryId: null,
      description: null,
      manualFxRate: null,
    });

    expect(await getDebtsByCategory(user.id, "BRL")).toMatchObject({
      receivable: [],
      payable: [],
      receivableTotal: 0,
    });
  });

  it("converte dívida em moeda estrangeira", async () => {
    const { user, account, lazer } = await scenario();
    const person = await makePerson(user.id);

    await createDebt(user.id, {
      personId: person.id,
      categoryId: lazer.id,
      type: "LENT",
      description: "Em dólar",
      amount: 100,
      currency: "USD",
      accountId: account.id,
      date: "2026-08-01",
      dueDate: null,
      manualFxRate: null,
    });

    expect(await getDebtsByCategory(user.id, "BRL")).toMatchObject({
      receivableTotal: 500,
      complete: true,
    });
  });

  it("não vê dívidas de outro usuário", async () => {
    // As dívidas do cenário existem; o intruso simplesmente não as alcança.
    await withDebts();
    const intruder = await makeUser();

    expect(await getDebtsByCategory(intruder.id, "BRL")).toMatchObject({
      receivable: [],
      payable: [],
    });
  });
});

/**
 * As mesmas agregações com a moeda base trocada.
 *
 * Os testes acima rodam em base BRL sobre carteira majoritariamente BRL, onde a
 * segunda conversão faz `rate = 1` e portanto não faz nada. O caminho de base
 * não-BRL era parametrizado e nunca exercitado — "parametrizado" e "verificado"
 * são coisas diferentes. Aqui a base é USD e **toda** linha em BRL passa pela
 * conversão, incluindo a identidade entre as duas visões.
 */
describe("base não-BRL", () => {
  /** Carteira mista: conta e cartão em BRL, conta e cartão em USD, base USD. */
  async function usdScenario() {
    const user = await makeUser({ baseCurrency: "USD" });
    const brlAccount = await makeAccount(user.id, {
      currency: "BRL",
      initialBalance: "5000.00",
    });
    const usdAccount = await makeAccount(user.id, {
      currency: "USD",
      initialBalance: "1000.00",
    });
    const brlCard = await makeCreditCard(user.id, {
      currency: "BRL",
      closingDay: 20,
      dueDay: 5,
    });
    const usdCard = await makeCreditCard(user.id, {
      currency: "USD",
      closingDay: 20,
      dueDay: 5,
    });

    const moradia = await makeCategory(user.id, { name: "Moradia", color: "#111111" });
    const luz = await makeCategory(user.id, { name: "Luz", parentId: moradia.id });
    const lazer = await makeCategory(user.id, { name: "Lazer", color: "#444444" });

    return { user, brlAccount, usdAccount, brlCard, usdCard, moradia, luz, lazer };
  }

  it("fluxo de caixa converte cada conta pela moeda dela", async () => {
    const { user, brlAccount, usdAccount, luz, lazer } = await usdScenario();

    await createTransaction(user.id, {
      ...expense(brlAccount.id, 5000, null, 5),
      type: "INCOME",
      description: "Salário em real",
    });
    await createTransaction(user.id, {
      ...expense(usdAccount.id, 2000, null, 5),
      type: "INCOME",
      currency: "USD",
      description: "Salário em dólar",
    });
    await createTransaction(user.id, expense(brlAccount.id, 250, luz.id));
    await createTransaction(user.id, {
      ...expense(usdAccount.id, 30, lazer.id),
      currency: "USD",
    });

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "USD");

    // R$ 5.000 → US$ 1.000, mais os US$ 2.000 que já estão na base.
    expect(summary.income).toBeCloseTo(3000, 2);
    // R$ 250 → US$ 50, mais US$ 30.
    expect(summary.expenses).toBeCloseTo(80, 2);
    expect(summary.net).toBeCloseTo(2920, 2);
    expect(summary.complete).toBe(true);
  });

  it("gasto por categoria soma conta e cartão já convertidos", async () => {
    const { user, brlAccount, usdAccount, brlCard, usdCard, luz, moradia, lazer } =
      await usdScenario();

    await createTransaction(user.id, expense(brlAccount.id, 250, luz.id));
    await createTransaction(user.id, {
      ...expense(usdAccount.id, 30, lazer.id),
      currency: "USD",
    });
    await createCardPurchase(user.id, purchase(brlCard.id, 100, lazer.id));
    await createCardPurchase(user.id, {
      ...purchase(usdCard.id, 25, moradia.id),
      currency: "USD",
    });

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "USD");

    // Moradia = R$ 250 (US$ 50) + US$ 25; Lazer = US$ 30 + R$ 100 (US$ 20).
    expect(named(summary.byCategory)).toEqual([
      { nome: "Moradia", valor: 75 },
      { nome: "Lazer", valor: 50 },
    ]);
    expect(summary.spendingTotal).toBeCloseTo(125, 2);
    expect(summary.cardSpending).toBeCloseTo(45, 2);
    // Compra no cartão não sai da conta, nem em base trocada.
    expect(summary.expenses).toBeCloseTo(80, 2);
    expect(summary.complete).toBe(true);
  });

  it("mantém a identidade entre fluxo de caixa e gasto por categoria", async () => {
    const { user, brlAccount, brlCard, luz, lazer } = await usdScenario();

    await createTransaction(user.id, expense(brlAccount.id, 250, luz.id));
    await createCardPurchase(user.id, purchase(brlCard.id, 100, lazer.id));

    const [invoice] = await listCardInvoices(user.id, brlCard.id);

    await payInvoice(user.id, invoice!.id, {
      accountId: brlAccount.id,
      date: "2026-08-25",
      manualFxRate: null,
    });

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "USD");

    // expenses = spendingTotal − cardSpending + invoicePayments, agora com toda
    // parcela passando pela conversão para USD.
    const identity = money(summary.spendingTotal)
      .minus(summary.cardSpending)
      .plus(summary.invoicePayments);

    expect(identity.toNumber()).toBeCloseTo(summary.expenses, 2);
    // R$ 250 de luz (US$ 50) + R$ 100 de fatura paga (US$ 20).
    expect(summary.expenses).toBeCloseTo(70, 2);
    expect(summary.spendingTotal).toBeCloseTo(70, 2);
    expect(summary.invoicePayments).toBeCloseTo(20, 2);
    expect(summary.cardSpending).toBeCloseTo(20, 2);
  });

  it("faturas em aberto somam na base, cada cartão pela moeda dele", async () => {
    const { user, brlCard, usdCard, lazer } = await usdScenario();

    await createCardPurchase(user.id, purchase(brlCard.id, 100, lazer.id));
    await createCardPurchase(user.id, {
      ...purchase(usdCard.id, 25, lazer.id),
      currency: "USD",
    });

    const open = await getOpenInvoices(user.id, "USD");

    // R$ 100 → US$ 20, mais US$ 25.
    expect(open.total).toBeCloseTo(45, 2);
    expect(open.count).toBe(2);
    expect(open.complete).toBe(true);
  });

  it("dívidas por categoria de origem saem na base", async () => {
    const { user, brlAccount, usdAccount, lazer, moradia } = await usdScenario();
    const person = await makePerson(user.id, { name: "Alice" });

    await createDebt(user.id, {
      personId: person.id,
      categoryId: lazer.id,
      type: "LENT",
      description: "Viagem",
      amount: 500,
      currency: "BRL",
      accountId: brlAccount.id,
      date: "2026-08-06",
      dueDate: null,
      manualFxRate: null,
    });

    await createDebt(user.id, {
      personId: person.id,
      categoryId: moradia.id,
      type: "BORROWED",
      description: "Aluguel adiantado",
      amount: 200,
      currency: "USD",
      accountId: usdAccount.id,
      date: "2026-08-08",
      dueDate: null,
      manualFxRate: null,
    });

    const result = await getDebtsByCategory(user.id, "USD");

    expect(named(result.receivable)).toEqual([{ nome: "Lazer", valor: 100 }]);
    expect(named(result.payable)).toEqual([{ nome: "Moradia", valor: 200 }]);
    expect(result.complete).toBe(true);
  });

  it("moeda sem cotação para a base sai do total, e o total sai parcial", async () => {
    const { user, brlAccount, lazer } = await usdScenario();
    const eur = await makeAccount(user.id, { currency: "EUR" });

    await createTransaction(user.id, expense(brlAccount.id, 250, lazer.id));
    await createTransaction(user.id, { ...expense(eur.id, 50, lazer.id), currency: "EUR" });

    const summary = await getMonthSummary(user.id, YEAR, MONTH, "USD");

    // Não há EUR->USD configurada: melhor um total honestamente parcial que um
    // total errado. A regra não muda quando a base não é BRL.
    expect(summary.expenses).toBeCloseTo(50, 2);
    expect(summary.complete).toBe(false);
  });
});
