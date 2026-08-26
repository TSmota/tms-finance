import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import {
  createCreditCard,
  deleteCreditCard,
  listCreditCards,
  updateCreditCard,
} from "@/lib/creditCards";
import { createCardPurchase } from "@/lib/cardPurchases";
import { listCardInvoices } from "@/lib/invoices";
import { payInvoice } from "@/lib/invoicePayments";
import type { CreditCardInput } from "@/lib/validations";
import { makeAccount, makeCreditCard, makeUser } from "../factories";
import { setRates } from "../setup-fx";

function cardInput(overrides: Partial<CreditCardInput> = {}): CreditCardInput {
  return {
    name: "Cartão",
    institution: null,
    closingDay: 20,
    dueDay: 5,
    currency: "BRL",
    creditLimit: null,
    defaultPaymentAccountId: null,
    ...overrides,
  };
}

async function buy(userId: string, creditCardId: string, amount: number, date = "2026-08-15") {
  return createCardPurchase(userId, {
    creditCardId,
    categoryId: null,
    description: "Compra",
    amount,
    currency: "BRL",
    date,
    installments: 1,
    manualFxRate: null,
  });
}

beforeEach(() => {
  setRates({ "USD->BRL": 5.4 });
});

describe("criação", () => {
  it("grava ciclo, instituição e limite", async () => {
    const user = await makeUser();

    const card = await createCreditCard(
      user.id,
      cardInput({ name: "Cartão Inter", institution: "Inter", creditLimit: 5000, closingDay: 28, dueDay: 10 }),
    );

    expect(card.name).toBe("Cartão Inter");
    expect(card.institution).toBe("Inter");
    expect(card.closingDay).toBe(28);
    expect(card.dueDay).toBe(10);
    expect(card.creditLimit?.toFixed(2)).toBe("5000.00");
  });

  it("aceita cartão sem limite informado", async () => {
    const user = await makeUser();

    const card = await createCreditCard(user.id, cardInput());

    expect(card.creditLimit).toBeNull();
  });

  it("vincula conta de pagamento padrão", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);

    const card = await createCreditCard(
      user.id,
      cardInput({ defaultPaymentAccountId: account.id }),
    );

    expect(card.defaultPaymentAccountId).toBe(account.id);
  });

  it("recusa conta de pagamento de outro usuário", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const foreign = await makeAccount(other.id);

    await expect(
      createCreditCard(user.id, cardInput({ defaultPaymentAccountId: foreign.id })),
    ).rejects.toThrow(NotFoundError);
    await expect(prisma.creditCard.count()).resolves.toBe(0);
  });

  it("recusa dias de ciclo fora de 1-31", async () => {
    const user = await makeUser();

    await expect(createCreditCard(user.id, cardInput({ closingDay: 0 }))).rejects.toThrow(
      InvalidOperationError,
    );
    await expect(createCreditCard(user.id, cardInput({ dueDay: 32 }))).rejects.toThrow(
      InvalidOperationError,
    );
  });
});

describe("edição", () => {
  it("permite mudar os dias do ciclo sem afetar faturas já emitidas", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });
    await buy(user.id, card.id, 100, "2026-08-10");

    const [antes] = await listCardInvoices(user.id, card.id);

    await updateCreditCard(user.id, card.id, cardInput({ closingDay: 28, dueDay: 10 }));

    const [depois] = await listCardInvoices(user.id, card.id);

    // A fatura de agosto mantém as datas com que foi emitida.
    expect(depois?.closingDate.toISOString()).toBe(antes?.closingDate.toISOString());
    expect(depois?.dueDate.toISOString()).toBe(antes?.dueDate.toISOString());
  });

  it("ignora tentativa de trocar a moeda", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { currency: "BRL" });

    const updated = await updateCreditCard(user.id, card.id, cardInput({ currency: "USD" }));

    // Trocar a moeda reinterpretaria os valores de todas as faturas emitidas.
    expect(updated.currency).toBe("BRL");
  });

  it("recusa cartão de outro usuário", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const card = await makeCreditCard(owner.id);

    await expect(updateCreditCard(intruder.id, card.id, cardInput())).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("exclusão", () => {
  it("remove cartão, faturas e lançamentos em cascata", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);
    await buy(user.id, card.id, 100);

    await deleteCreditCard(user.id, card.id);

    await expect(prisma.creditCard.count()).resolves.toBe(0);
    await expect(prisma.invoice.count()).resolves.toBe(0);
    await expect(prisma.transaction.count()).resolves.toBe(0);
  });

  it("recusa remover cartão com fatura paga", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });
    await buy(user.id, card.id, 100);
    const [invoice] = await listCardInvoices(user.id, card.id);
    await payInvoice(user.id, invoice!.id, {
      accountId: account.id,
      date: "2026-09-05",
      manualFxRate: null,
    });

    // Apagar levaria o histórico e deixaria a transação de pagamento órfã.
    await expect(deleteCreditCard(user.id, card.id)).rejects.toThrow(
      /fatura\(s\) paga\(s\)/,
    );
    await expect(prisma.creditCard.count()).resolves.toBe(1);
  });

  it("recusa cartão de outro usuário", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const card = await makeCreditCard(owner.id);

    await expect(deleteCreditCard(intruder.id, card.id)).rejects.toThrow(NotFoundError);
  });
});

describe("limite usado e disponível", () => {
  it("soma as faturas não pagas", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { creditLimit: "5000.00", closingDay: 20, dueDay: 5 });

    await buy(user.id, card.id, 300, "2026-08-10");
    await buy(user.id, card.id, 200, "2026-09-10");

    const [summary] = await listCreditCards(user.id);

    expect(summary?.usedLimit).toBeCloseTo(500, 2);
    expect(summary?.availableLimit).toBeCloseTo(4500, 2);
    expect(summary?.openInvoiceCount).toBe(2);
  });

  it("libera o limite quando a fatura é paga", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "5000.00" });
    const card = await makeCreditCard(user.id, { creditLimit: "5000.00", closingDay: 20, dueDay: 5 });
    await buy(user.id, card.id, 300);

    const [invoice] = await listCardInvoices(user.id, card.id);
    await payInvoice(user.id, invoice!.id, {
      accountId: account.id,
      date: "2026-09-05",
      manualFxRate: null,
    });

    const [summary] = await listCreditCards(user.id);

    expect(summary?.usedLimit).toBeCloseTo(0, 2);
    expect(summary?.availableLimit).toBeCloseTo(5000, 2);
    expect(summary?.openInvoiceCount).toBe(0);
  });

  it("deixa o disponível nulo quando não há limite informado", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);
    await buy(user.id, card.id, 100);

    const [summary] = await listCreditCards(user.id);

    expect(summary?.creditLimit).toBeNull();
    expect(summary?.availableLimit).toBeNull();
    expect(summary?.usedLimit).toBeCloseTo(100, 2);
  });

  it("permite disponível negativo quando o uso passa do limite", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { creditLimit: "100.00" });
    await buy(user.id, card.id, 250);

    const [summary] = await listCreditCards(user.id);

    // Melhor mostrar o estouro do que esconder atrás de um zero.
    expect(summary?.availableLimit).toBeCloseTo(-150, 2);
  });
});

describe("listagem", () => {
  it("ordena por nome e traz a conta de pagamento padrão", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { name: "Conta corrente" });
    await makeCreditCard(user.id, { name: "Zebra" });
    await makeCreditCard(user.id, { name: "Águia", defaultPaymentAccountId: account.id });

    const cards = await listCreditCards(user.id);

    expect(cards.map((card) => card.name)).toEqual(["Águia", "Zebra"]);
    expect(cards[0]?.defaultPaymentAccountName).toBe("Conta corrente");
    expect(cards[1]?.defaultPaymentAccountName).toBeNull();
  });

  it("não lista cartões de outros usuários", async () => {
    const user = await makeUser();
    const other = await makeUser();
    await makeCreditCard(user.id, { name: "Meu" });
    await makeCreditCard(other.id, { name: "De outro" });

    const cards = await listCreditCards(user.id);

    expect(cards.map((card) => card.name)).toEqual(["Meu"]);
  });
});
