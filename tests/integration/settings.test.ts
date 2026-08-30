import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { updateBaseCurrency } from "@/lib/settings";
import { baseCurrencySchema } from "@/lib/validations";
import { NotFoundError } from "@/lib/errors";
import { createTransaction } from "@/lib/transactions";
import { createCardPurchase } from "@/lib/cardPurchases";
import { createDebt } from "@/lib/debts";
import { getMonthSummary } from "@/lib/reports";
import { makeAccount, makeCategory, makeCreditCard, makePerson, makeUser } from "@tests/support/factories";
import { setRates } from "@tests/setup-fx";

/**
 * Moeda base configurável.
 *
 * O teste que carrega o arquivo é o último: trocar a moeda base com dados já
 * gravados **não muda nenhum valor no banco**. É o que separa esta moeda da
 * moeda de conta, cartão e dívida, imutáveis porque trocá-las reinterpretaria o
 * histórico. Aqui a moeda base só é *lida*, na agregação.
 */

const YEAR = 2026;
const MONTH = 8;

beforeEach(() => {
  setRates({ "USD->BRL": 5, "BRL->USD": 0.2 });
});

describe("updateBaseCurrency", () => {
  it("grava a moeda escolhida", async () => {
    const user = await makeUser({ baseCurrency: "BRL" });

    await updateBaseCurrency(user.id, { baseCurrency: "USD" });

    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(saved.baseCurrency).toBe("USD");
  });

  it("aceita as quatro moedas do enum", async () => {
    const user = await makeUser({ baseCurrency: "BRL" });

    for (const currency of ["USD", "EUR", "GBP", "BRL"] as const) {
      await updateBaseCurrency(user.id, { baseCurrency: currency });

      const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

      expect(saved.baseCurrency).toBe(currency);
    }
  });

  it("recusa moeda fora do enum antes de chegar ao serviço", () => {
    // O `Currency` do Postgres recusaria também, mas com erro cru: é o schema
    // que devolve mensagem em pt-BR para o formulário.
    for (const invalid of ["JPY", "brl", "", null, 42]) {
      expect(baseCurrencySchema.safeParse({ baseCurrency: invalid }).success).toBe(false);
    }

    expect(baseCurrencySchema.safeParse({ baseCurrency: "EUR" }).success).toBe(true);
  });

  it("usuário inexistente é NotFoundError, não erro de Prisma", async () => {
    await expect(
      updateBaseCurrency("00000000-0000-4000-8000-000000000000", { baseCurrency: "USD" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("não alcança a moeda de outro usuário", async () => {
    const mine = await makeUser({ baseCurrency: "BRL" });
    const theirs = await makeUser({ baseCurrency: "EUR" });

    await updateBaseCurrency(mine.id, { baseCurrency: "USD" });

    const other = await prisma.user.findUniqueOrThrow({ where: { id: theirs.id } });

    // A recusa é por escopo do `where`, e o teste afirma também que nada mudou.
    expect(other.baseCurrency).toBe("EUR");
  });
});

describe("trocar a moeda base não reinterpreta histórico", () => {
  /**
   * Toda coluna monetária do banco, com a moeda que a acompanha. Se a troca da
   * moeda base tocasse qualquer uma delas, um R$ 100 gravado passaria a valer
   * US$ 100 — exatamente o que é proibido para conta, cartão e dívida.
   */
  async function moneySnapshot(userId: string) {
    const [accounts, transactions, invoices, debts] = await Promise.all([
      prisma.financialAccount.findMany({
        where: { userId },
        select: { id: true, currency: true, initialBalance: true, currentBalance: true },
        orderBy: { id: "asc" },
      }),
      prisma.transaction.findMany({
        where: { userId },
        select: {
          id: true,
          currency: true,
          amount: true,
          convertedAmount: true,
          exchangeRate: true,
        },
        orderBy: { id: "asc" },
      }),
      prisma.invoice.findMany({
        where: { userId },
        select: { id: true, currency: true, totalAmount: true },
        orderBy: { id: "asc" },
      }),
      prisma.debt.findMany({
        where: { userId },
        select: { id: true, currency: true, originalAmount: true, remainingAmount: true },
        orderBy: { id: "asc" },
      }),
    ]);

    // `Decimal` do Prisma não é comparável por `toEqual`; string preserva a escala.
    return JSON.parse(
      JSON.stringify({ accounts, transactions, invoices, debts }, (_key, value) =>
        typeof value === "object" && value !== null && "toFixed" in value
          ? String(value)
          : value,
      ),
    );
  }

  /** Carteira mista com lançamento em conta, compra no cartão e dívida. */
  async function mixedWallet() {
    const user = await makeUser({ baseCurrency: "BRL" });
    const brl = await makeAccount(user.id, { currency: "BRL", initialBalance: "1000.00" });
    const usd = await makeAccount(user.id, { currency: "USD", initialBalance: "500.00" });
    const card = await makeCreditCard(user.id, {
      currency: "USD",
      closingDay: 20,
      dueDay: 5,
    });
    const lazer = await makeCategory(user.id, { name: "Lazer" });
    const person = await makePerson(user.id);

    await createTransaction(user.id, {
      accountId: brl.id,
      categoryId: lazer.id,
      type: "EXPENSE",
      amount: 100,
      currency: "BRL",
      date: "2026-08-10",
      description: "Despesa em real",
      manualFxRate: null,
    });

    // Lançamento em BRL numa conta em USD: exercita o `exchangeRate` por linha.
    await createTransaction(user.id, {
      accountId: usd.id,
      categoryId: lazer.id,
      type: "EXPENSE",
      amount: 250,
      currency: "BRL",
      date: "2026-08-11",
      description: "Despesa convertida",
      manualFxRate: null,
    });

    await createCardPurchase(user.id, {
      creditCardId: card.id,
      categoryId: lazer.id,
      description: "Compra no cartão",
      amount: 40,
      currency: "USD",
      date: "2026-08-12",
      installments: 2,
      manualFxRate: null,
    });

    await createDebt(user.id, {
      personId: person.id,
      categoryId: lazer.id,
      type: "LENT",
      description: "Empréstimo",
      amount: 60,
      currency: "USD",
      accountId: usd.id,
      creditCardId: null,
      installments: 1,
      date: "2026-08-13",
      dueDate: null,
      manualFxRate: null,
    });

    return { user };
  }

  it("nenhum valor gravado muda quando a base vira USD", async () => {
    const { user } = await mixedWallet();

    const before = await moneySnapshot(user.id);

    await updateBaseCurrency(user.id, { baseCurrency: "USD" });

    expect(await moneySnapshot(user.id)).toEqual(before);
  });

  it("só a leitura muda: o mesmo mês sai em outra moeda", async () => {
    const { user } = await mixedWallet();

    const inBrl = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    await updateBaseCurrency(user.id, { baseCurrency: "USD" });

    const inUsd = await getMonthSummary(user.id, YEAR, MONTH, "USD");

    // Mesma carteira, mesma cotação: os totais são o de BRL a 0,2.
    expect(inUsd.spendingTotal).toBeCloseTo(inBrl.spendingTotal * 0.2, 2);
    expect(inUsd.expenses).toBeCloseTo(inBrl.expenses * 0.2, 2);
    expect(inUsd.complete).toBe(true);
    expect(inBrl.complete).toBe(true);
  });

  it("a troca ida e volta devolve exatamente o total original", async () => {
    const { user } = await mixedWallet();

    const original = await getMonthSummary(user.id, YEAR, MONTH, "BRL");

    await updateBaseCurrency(user.id, { baseCurrency: "USD" });
    await updateBaseCurrency(user.id, { baseCurrency: "BRL" });

    expect(await getMonthSummary(user.id, YEAR, MONTH, "BRL")).toEqual(original);
  });
});
