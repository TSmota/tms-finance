import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { deleteAccount } from "@/lib/accounts";
import { deleteCategory } from "@/lib/categories";
import { deleteCreditCard } from "@/lib/creditCards";
import { createDebt, deleteDebt, settleDebt } from "@/lib/debts";
import { deletePerson } from "@/lib/people";
import { createCardPurchase } from "@/lib/cardPurchases";
import { payInvoice } from "@/lib/invoicePayments";
import { createTransaction } from "@/lib/transactions";
import { createRecurringExpense } from "@/lib/recurring";
import { describeDeletionImpact, type DeletionImpact } from "@/lib/deletionImpact";
import { makeAccount, makeCategory, makeCreditCard, makePerson, makeUser } from "@tests/support/factories";
import { setRates } from "@tests/setup-fx";

/**
 * O preview de impacto tem de bater **exatamente** com o que a remoção apaga.
 *
 * Um preview que subconta é pior que preview nenhum: ele dá falsa segurança
 * justamente no momento em que alguém está decidindo apagar histórico. Então
 * cada caso aqui monta o cenário, mede, apaga, e confere que a contagem do
 * preview era a verdade.
 *
 * É por isso que os testes usam os serviços reais em vez de inserir linhas na
 * mão: o cascade que se quer medir é o do Postgres, e só o caminho real o
 * exercita.
 */

beforeEach(() => {
  setRates({ "USD->BRL": 5, "BRL->USD": 0.2 });
});

/** Atalho: a contagem de uma linha do preview, ou 0 se ela não veio. */
function entry(impact: DeletionImpact, key: string): number {
  return impact.entries.find((row) => row.key === key)?.count ?? 0;
}

async function expense(
  userId: string,
  accountId: string,
  categoryId: string | null,
  overrides: { amount?: number; date?: string; description?: string } = {},
) {
  return createTransaction(userId, {
    accountId,
    categoryId,
    type: "EXPENSE",
    amount: overrides.amount ?? 100,
    currency: "BRL",
    date: overrides.date ?? "2026-08-10",
    description: overrides.description ?? "Gasto",
    manualFxRate: null,
  });
}

describe("conta bancária — o caso sem nenhuma guarda", () => {
  it("conta lançamentos, recorrentes, faturas pagas e cartões que a usam como padrão", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { name: "Conta Corrente", initialBalance: "5000.00" });
    const category = await makeCategory(user.id);
    const card = await makeCreditCard(user.id, {
      closingDay: 20,
      dueDay: 5,
      defaultPaymentAccountId: account.id,
    });

    await expense(user.id, account.id, category.id, { date: "2026-06-03" });
    await expense(user.id, account.id, category.id, { date: "2026-07-15" });
    await expense(user.id, account.id, null, { date: "2026-08-01" });

    await createRecurringExpense(user.id, {
      description: "Internet",
      amount: 120,
      currency: "BRL",
      frequency: "MONTHLY",
      dueDay: 10,
      isEstimated: false,
      startDate: "2026-01-01",
      endDate: null,
      categoryId: category.id,
      accountId: account.id,
      creditCardId: null,
    });

    // Uma fatura paga por esta conta: ela sobrevive, mas perde o vínculo.
    await createCardPurchase(user.id, {
      creditCardId: card.id,
      categoryId: category.id,
      description: "Compra",
      amount: 200,
      currency: "BRL",
      date: "2026-08-05",
      installments: 1,
      manualFxRate: null,
    });

    const invoice = await prisma.invoice.findFirstOrThrow({ where: { creditCardId: card.id } });

    await payInvoice(user.id, invoice.id, {
      accountId: account.id,
      date: "2026-09-05",
      manualFxRate: null,
    });

    const impact = await describeDeletionImpact(user.id, "account", account.id);

    expect(impact.label).toBe("Conta Corrente");
    // O lançamento mais antigo é de junho — o dado que dimensiona a perda.
    expect(impact.oldestRecord).toBe("2026-06-03");

    /**
     * Fatura paga por esta conta: a remoção é IMPOSSÍVEL, não apenas
     * destrutiva. `Invoice.paymentAccountId` é SetNull, mas o CHECK
     * `invoices_paid_consistency_check` exige a coluna preenchida quando o
     * status é PAID. O preview precisa dizer isso, ou promete o que o banco
     * recusa.
     */
    expect(impact.blockedBy).toMatch(/pagou 1 fatura\(s\) de cartão/);

    const transactionsBefore = await prisma.transaction.count({
      where: { accountId: account.id },
    });
    const recurringBefore = await prisma.recurringExpense.count({
      where: { accountId: account.id },
    });

    // 3 gastos + o lançamento de pagamento da fatura.
    expect(transactionsBefore).toBe(4);
    expect(entry(impact, "transactions")).toBe(transactionsBefore);
    expect(entry(impact, "recurring_expenses")).toBe(recurringBefore);
    expect(entry(impact, "invoices_paid_here")).toBe(1);
    expect(entry(impact, "cards_defaulting_here")).toBe(1);

    // E o `blockedBy` não é opinião: o serviço de fato estoura.
    await expect(deleteAccount(user.id, account.id)).rejects.toThrow();

    // Recusou e não deixou lixo — nada foi apagado pelo caminho.
    expect(await prisma.transaction.count({ where: { accountId: account.id } })).toBe(
      transactionsBefore,
    );
    expect(await prisma.recurringExpense.count({ where: { accountId: account.id } })).toBe(
      recurringBefore,
    );
  });

  /**
   * O mesmo cenário sem o pagamento de fatura: aí a remoção acontece, e é o
   * caso em que o preview é a ÚNICA coisa entre o agente e a perda — porque
   * `deleteAccount` é um `deleteMany` sem guarda nenhuma.
   */
  it("bate com a realidade quando a remoção é permitida", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { name: "Poupança", initialBalance: "5000.00" });
    const category = await makeCategory(user.id);
    const card = await makeCreditCard(user.id, { defaultPaymentAccountId: account.id });

    await expense(user.id, account.id, category.id, { date: "2026-06-03" });
    await expense(user.id, account.id, category.id, { date: "2026-07-15" });

    await createRecurringExpense(user.id, {
      description: "Internet",
      amount: 120,
      currency: "BRL",
      frequency: "MONTHLY",
      dueDay: 10,
      isEstimated: false,
      startDate: "2026-01-01",
      endDate: null,
      categoryId: category.id,
      accountId: account.id,
      creditCardId: null,
    });

    const impact = await describeDeletionImpact(user.id, "account", account.id);

    expect(impact.blockedBy).toBeNull();
    expect(entry(impact, "transactions")).toBe(2);
    expect(entry(impact, "recurring_expenses")).toBe(1);
    expect(entry(impact, "cards_defaulting_here")).toBe(1);
    expect(impact.oldestRecord).toBe("2026-06-03");

    await deleteAccount(user.id, account.id);

    // A verdade depois do fato: o preview não subcontou.
    expect(await prisma.transaction.count({ where: { accountId: account.id } })).toBe(0);
    expect(await prisma.recurringExpense.count({ where: { accountId: account.id } })).toBe(0);

    // E o que era `detach` de fato sobreviveu, sem o vínculo.
    const survivingCard = await prisma.creditCard.findUniqueOrThrow({ where: { id: card.id } });

    expect(survivingCard.defaultPaymentAccountId).toBeNull();
  });

  it("relata as dívidas que perdem a origem ao remover a conta", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);

    await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Empréstimo",
      amount: 100,
      currency: "BRL",
      accountId: account.id,
      creditCardId: null,
      installments: 1,
      date: "2026-08-06",
      dueDate: null,
      manualFxRate: null,
    });

    const impact = await describeDeletionImpact(user.id, "account", account.id);

    expect(impact.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "debts_losing_origin", count: 1, effect: "detach" }),
      ]),
    );
  });

  it("omite as linhas zeradas de uma conta isolada", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);

    const impact = await describeDeletionImpact(user.id, "account", account.id);

    expect(impact.entries).toEqual([]);
    expect(impact.oldestRecord).toBeNull();
  });

  it("recusa medir conta de outro usuário, indistinguível de inexistente", async () => {
    const owner = await makeUser({ email: "o@test.local" });
    const stranger = await makeUser({ email: "s@test.local" });
    const account = await makeAccount(owner.id);

    await expect(
      describeDeletionImpact(stranger.id, "account", account.id),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("cartão de crédito", () => {
  it("conta faturas e lançamentos, e antecipa a recusa por fatura paga", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "5000.00" });
    const category = await makeCategory(user.id);
    const card = await makeCreditCard(user.id, { name: "Cartão X", closingDay: 20, dueDay: 5 });

    await createCardPurchase(user.id, {
      creditCardId: card.id,
      categoryId: category.id,
      description: "Compra parcelada",
      amount: 300,
      currency: "BRL",
      date: "2026-08-05",
      installments: 3,
      manualFxRate: null,
    });

    const openImpact = await describeDeletionImpact(user.id, "credit_card", card.id);

    expect(openImpact.label).toBe("Cartão X");
    expect(openImpact.blockedBy).toBeNull();
    expect(entry(openImpact, "transactions")).toBe(3);
    expect(entry(openImpact, "invoices")).toBe(3);

    // Pagar uma fatura passa a bloquear a remoção — e o preview já diz isso,
    // antes de o agente gastar uma rodada de confirmação para descobrir.
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { creditCardId: card.id },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    await payInvoice(user.id, invoice.id, {
      accountId: account.id,
      date: "2026-09-05",
      manualFxRate: null,
    });

    const blockedImpact = await describeDeletionImpact(user.id, "credit_card", card.id);

    expect(blockedImpact.blockedBy).toMatch(/fatura\(s\) paga\(s\)/);
    await expect(deleteCreditCard(user.id, card.id)).rejects.toThrow();
  });

  it("bate com a realidade quando a remoção é permitida", async () => {
    const user = await makeUser();
    const category = await makeCategory(user.id);
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(user.id, {
      creditCardId: card.id,
      categoryId: category.id,
      description: "Compra",
      amount: 90,
      currency: "BRL",
      date: "2026-08-05",
      installments: 1,
      manualFxRate: null,
    });

    const impact = await describeDeletionImpact(user.id, "credit_card", card.id);

    await deleteCreditCard(user.id, card.id);

    expect(await prisma.transaction.count({ where: { creditCardId: card.id } })).toBe(0);
    expect(await prisma.invoice.count({ where: { creditCardId: card.id } })).toBe(0);
    expect(entry(impact, "transactions")).toBe(1);
    expect(entry(impact, "invoices")).toBe(1);
  });

  it("relata as dívidas que perdem a origem ao remover o cartão", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);

    await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Passagens do grupo",
      amount: 300,
      currency: "BRL",
      accountId: null,
      creditCardId: card.id,
      installments: 3,
      date: "2026-08-06",
      dueDate: null,
      manualFxRate: null,
    });

    const impact = await describeDeletionImpact(user.id, "credit_card", card.id);

    expect(impact.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "debts_losing_origin", count: 1, effect: "detach" }),
      ]),
    );
  });
});

describe("pessoa", () => {
  it("antecipa a recusa por posição em aberto", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id, { name: "João" });

    await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Empréstimo",
      amount: 300,
      currency: "BRL",
      accountId: account.id,
      creditCardId: null,
      installments: 1,
      date: "2026-08-01",
      dueDate: null,
      manualFxRate: null,
    });

    const impact = await describeDeletionImpact(user.id, "person", person.id);

    expect(impact.label).toBe("João");
    expect(impact.blockedBy).toMatch(/dívida\(s\) em aberto/);
    await expect(deletePerson(user.id, person.id)).rejects.toThrow();
  });

  it("conta as dívidas quitadas que somem e os lançamentos que perdem o vínculo", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);

    const debt = await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Empréstimo",
      amount: 300,
      currency: "BRL",
      accountId: account.id,
      creditCardId: null,
      installments: 1,
      date: "2026-08-01",
      dueDate: null,
      manualFxRate: null,
    });

    // Quitar por inteiro: só então a remoção da pessoa é permitida.
    await settleDebt(user.id, debt.id, {
      amount: 300,
      currency: "BRL",
      accountId: account.id,
      date: "2026-08-20",
      categoryId: null,
      description: null,
      manualFxRate: null,
    });

    const impact = await describeDeletionImpact(user.id, "person", person.id);

    expect(impact.blockedBy).toBeNull();
    expect(entry(impact, "debts")).toBe(1);
    // Origem + amortização: os dois ficam no fluxo de caixa, sem a dívida.
    expect(entry(impact, "transactions_orphaned")).toBe(2);

    await deletePerson(user.id, person.id);

    expect(await prisma.debt.count({ where: { personId: person.id } })).toBe(0);

    // Lacuna conhecida: o dinheiro fica, o agrupamento por dívida se perde.
    const orphans = await prisma.transaction.findMany({
      where: { userId: user.id, accountId: account.id },
      select: { debtId: true },
    });

    expect(orphans).toHaveLength(2);
    expect(orphans.every((row) => row.debtId === null)).toBe(true);
  });
});

describe("categoria", () => {
  it("conta subcategorias e lançamentos que perdem a categoria", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const parent = await makeCategory(user.id, { name: "Casa" });
    const child = await makeCategory(user.id, { name: "Luz", parentId: parent.id });

    await expense(user.id, account.id, parent.id);
    await expense(user.id, account.id, child.id);

    const impact = await describeDeletionImpact(user.id, "category", parent.id);

    expect(impact.label).toBe("Casa");
    expect(impact.blockedBy).toBeNull();
    expect(entry(impact, "subcategories")).toBe(1);
    // Conta a categoria E a subcategoria: apagar a raiz leva as duas.
    expect(entry(impact, "transactions_uncategorized")).toBe(2);

    await deleteCategory(user.id, parent.id);

    expect(await prisma.category.count({ where: { userId: user.id } })).toBe(0);

    const rows = await prisma.transaction.findMany({
      where: { userId: user.id },
      select: { categoryId: true },
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.categoryId === null)).toBe(true);
  });

  /**
   * `RecurringExpense.categoryId` e `Debt.categoryId` são FK obrigatórias sem
   * `onDelete`, então o Postgres recusa. O serviço não checa isso — a recusa
   * vem do banco como erro de constraint. Medir aqui transforma um erro opaco
   * numa explicação, antes de gastar a confirmação.
   */
  it("antecipa a recusa por FK obrigatória de recorrente", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const category = await makeCategory(user.id);

    await createRecurringExpense(user.id, {
      description: "Internet",
      amount: 100,
      currency: "BRL",
      frequency: "MONTHLY",
      dueDay: 10,
      isEstimated: false,
      startDate: "2026-01-01",
      endDate: null,
      categoryId: category.id,
      accountId: account.id,
      creditCardId: null,
    });

    const impact = await describeDeletionImpact(user.id, "category", category.id);

    expect(impact.blockedBy).toMatch(/gasto\(s\) recorrente\(s\)/);
    await expect(deleteCategory(user.id, category.id)).rejects.toThrow();
  });

  it("antecipa a recusa por FK obrigatória de dívida", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);

    await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Empréstimo",
      amount: 100,
      currency: "BRL",
      accountId: account.id,
      creditCardId: null,
      installments: 1,
      date: "2026-08-01",
      dueDate: null,
      manualFxRate: null,
    });

    const impact = await describeDeletionImpact(user.id, "category", category.id);

    expect(impact.blockedBy).toMatch(/dívida\(s\)/);
  });
});

describe("dívida", () => {
  it("conta as movimentações e as contas que terão o saldo revertido", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);

    const debt = await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Empréstimo do carro",
      amount: 400,
      currency: "BRL",
      accountId: account.id,
      creditCardId: null,
      installments: 1,
      date: "2026-08-01",
      dueDate: null,
      manualFxRate: null,
    });

    await settleDebt(user.id, debt.id, {
      amount: 150,
      currency: "BRL",
      accountId: account.id,
      date: "2026-08-20",
      categoryId: null,
      description: null,
      manualFxRate: null,
    });

    const impact = await describeDeletionImpact(user.id, "debt", debt.id);

    expect(impact.label).toBe("Empréstimo do carro");
    expect(entry(impact, "movements")).toBe(2);
    expect(entry(impact, "accounts_rebalanced")).toBe(1);
    expect(impact.oldestRecord).toBe("2026-08-01");

    await deleteDebt(user.id, debt.id);

    expect(await prisma.transaction.count({ where: { debtId: debt.id } })).toBe(0);

    // O caixa volta ao que era: esta remoção é coerente, ao contrário das outras.
    const after = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { currentBalance: true },
    });

    expect(after.currentBalance.toFixed(2)).toBe("1000.00");
  });
});
