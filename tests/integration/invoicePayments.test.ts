import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { recomputeBalance } from "@/lib/accountBalance";
import { createCardPurchase } from "@/lib/cardPurchases";
import { listCardInvoices, recalcInvoiceTotal } from "@/lib/invoices";
import { payInvoice, undoInvoicePayment } from "@/lib/invoicePayments";
import { makeAccount, makeCreditCard, makeUser } from "@tests/support/factories";
import { setFxAvailable, setRates } from "@tests/setup-fx";

/**
 * Pagamento de fatura.
 *
 * O pagamento é o único momento em que dinheiro de cartão toca a conta
 * bancária. O que estes testes protegem: debitar o valor exato, uma única vez,
 * e não permitir pagamento duplicado.
 */

async function balanceOf(accountId: string): Promise<string> {
  const account = await prisma.financialAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { currentBalance: true },
  });

  return account.currentBalance.toFixed(2);
}

/** Cria cartão com uma fatura aberta de `amount` e devolve tudo o que importa. */
async function scenario(options: { amount?: number; cardCurrency?: "BRL" | "USD" } = {}) {
  const user = await makeUser();
  const account = await makeAccount(user.id, { initialBalance: "1000.00" });
  const card = await makeCreditCard(user.id, {
    closingDay: 20,
    dueDay: 5,
    currency: options.cardCurrency ?? "BRL",
  });

  await createCardPurchase(user.id, {
    creditCardId: card.id,
    categoryId: null,
    description: "Compra",
    amount: options.amount ?? 250,
    currency: options.cardCurrency ?? "BRL",
    date: "2026-08-15",
    installments: 1,
    manualFxRate: null,
  });

  const [invoice] = await listCardInvoices(user.id, card.id);

  return { user, account, card, invoice: invoice! };
}

const payment = { date: "2026-09-05", manualFxRate: null };

beforeEach(() => {
  setRates({ "USD->BRL": 5.4, "BRL->USD": 0.1852 });
});

describe("pagamento", () => {
  it("debita a conta pelo total exato e marca a fatura como paga", async () => {
    const { user, account, invoice } = await scenario({ amount: 250 });

    const created = await payInvoice(user.id, invoice.id, {
      accountId: account.id,
      ...payment,
    });

    expect(created.type).toBe("INVOICE_PAYMENT");
    expect(created.convertedAmount.toFixed(2)).toBe("250.00");
    expect(await balanceOf(account.id)).toBe("750.00");

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("PAID");
    expect(after.paidAt?.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(after.paymentAccountId).toBe(account.id);
  });

  it("não altera o total da fatura ao registrar o pagamento", async () => {
    const { user, account, invoice } = await scenario({ amount: 250 });

    await payInvoice(user.id, invoice.id, { accountId: account.id, ...payment });

    // A transação de pagamento também aponta para a fatura; se entrasse na
    // soma, o total viraria o dobro (ou zero, dependendo do sinal).
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.totalAmount.toFixed(2)).toBe("250.00");
  });

  it("não conta o próprio pagamento como item da fatura", async () => {
    // Pelo mesmo motivo do total: o pagamento aponta para a fatura, e a
    // listagem de itens já o exclui. Uma fatura de uma compra passava a dizer
    // "2 itens" só por ter sido paga.
    const { user, account, card, invoice } = await scenario({ amount: 250 });

    expect((await listCardInvoices(user.id, card.id))[0]?.itemCount).toBe(1);

    await payInvoice(user.id, invoice.id, { accountId: account.id, ...payment });

    expect((await listCardInvoices(user.id, card.id))[0]?.itemCount).toBe(1);
  });

  it("mantém o saldo denormalizado consistente com o recálculo", async () => {
    const { user, account, invoice } = await scenario({ amount: 250 });

    await payInvoice(user.id, invoice.id, { accountId: account.id, ...payment });

    const recomputed = await recomputeBalance(account.id);
    expect(await balanceOf(account.id)).toBe(recomputed.toFixed(2));
  });

  it("permite pagar por conta de outro banco", async () => {
    const { user, invoice } = await scenario({ amount: 100 });
    const outra = await makeAccount(user.id, {
      name: "Conta de outro banco",
      institution: "Itaú",
      initialBalance: "500.00",
    });

    await payInvoice(user.id, invoice.id, { accountId: outra.id, ...payment });

    expect(await balanceOf(outra.id)).toBe("400.00");
  });

  it("converte quando a fatura e a conta estão em moedas diferentes", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { currency: "BRL", initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id, {
      currency: "USD",
      closingDay: 20,
      dueDay: 5,
    });

    await createCardPurchase(user.id, {
      creditCardId: card.id,
      categoryId: null,
      description: "Compra em dólar",
      amount: 100,
      currency: "USD",
      date: "2026-08-15",
      installments: 1,
      manualFxRate: null,
    });

    const [invoice] = await listCardInvoices(user.id, card.id);

    const created = await payInvoice(user.id, invoice!.id, {
      accountId: account.id,
      ...payment,
    });

    // Fatura de US$ 100 paga por conta em BRL: debita 100 × 5,40 = 540.
    expect(created.amount.toFixed(2)).toBe("100.00");
    expect(created.currency).toBe("USD");
    expect(created.exchangeRate.toFixed(4)).toBe("5.4000");
    expect(created.convertedAmount.toFixed(2)).toBe("540.00");
    expect(await balanceOf(account.id)).toBe("460.00");
  });

  it("paga fatura com múltiplas parcelas de compras diferentes", async () => {
    const { user, account, card, invoice } = await scenario({ amount: 100 });

    await createCardPurchase(user.id, {
      creditCardId: card.id,
      categoryId: null,
      description: "Outra compra",
      amount: 50.5,
      currency: "BRL",
      date: "2026-08-16",
      installments: 1,
      manualFxRate: null,
    });

    await payInvoice(user.id, invoice.id, { accountId: account.id, ...payment });

    expect(await balanceOf(account.id)).toBe("849.50");
  });
});

describe("proteções", () => {
  it("recálculo não apaga fatura paga, mesmo sem lançamento algum", async () => {
    const { user, account, invoice } = await scenario({ amount: 250 });

    await payInvoice(user.id, invoice.id, { accountId: account.id, ...payment });

    // Estado que nenhum serviço produz, montado à mão para exercitar a guarda
    // de status: sem ela, a fatura paga sumiria junto com o que já foi debitado.
    await prisma.transaction.deleteMany({ where: { invoiceId: invoice.id } });

    await prisma.$transaction((tx) => recalcInvoiceTotal(tx, invoice.id));

    await expect(
      prisma.invoice.findUnique({ where: { id: invoice.id }, select: { status: true } }),
    ).resolves.toEqual({ status: "PAID" });
  });

  it("recusa pagar a mesma fatura duas vezes, sem debitar de novo", async () => {
    const { user, account, invoice } = await scenario({ amount: 250 });

    await payInvoice(user.id, invoice.id, { accountId: account.id, ...payment });

    await expect(
      payInvoice(user.id, invoice.id, { accountId: account.id, ...payment }),
    ).rejects.toThrow(InvalidOperationError);

    expect(await balanceOf(account.id)).toBe("750.00");
    await expect(
      prisma.transaction.count({ where: { type: "INVOICE_PAYMENT" } }),
    ).resolves.toBe(1);
  });

  it("dois pagamentos simultâneos debitam a conta uma única vez", async () => {
    // A recheca de status fora da transação não basta: sob READ COMMITTED as
    // duas leem OPEN e ambas debitam. Só o FOR UPDATE serializa.
    const { user, account, invoice } = await scenario({ amount: 250 });

    const results = await Promise.allSettled([
      payInvoice(user.id, invoice.id, { accountId: account.id, ...payment }),
      payInvoice(user.id, invoice.id, { accountId: account.id, ...payment }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await balanceOf(account.id)).toBe("750.00");
    await expect(
      prisma.transaction.count({ where: { type: "INVOICE_PAYMENT" } }),
    ).resolves.toBe(1);
    expect((await recomputeBalance(account.id)).toFixed(2)).toBe("750.00");
  });

  it("recusa fatura sem valor a pagar", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    // Fatura criada mas ainda sem lançamentos.
    const invoice = await prisma.invoice.create({
      data: {
        userId: user.id,
        creditCardId: card.id,
        month: 8,
        year: 2026,
        closingDate: new Date("2026-08-20T00:00:00Z"),
        dueDate: new Date("2026-09-05T00:00:00Z"),
      },
    });

    await expect(
      payInvoice(user.id, invoice.id, { accountId: account.id, ...payment }),
    ).rejects.toThrow(/Não há valor a pagar/);
    expect(await balanceOf(account.id)).toBe("1000.00");
  });

  it("recusa conta de outro usuário", async () => {
    const { user, invoice } = await scenario();
    const other = await makeUser();
    const foreign = await makeAccount(other.id, { initialBalance: "1000.00" });

    await expect(
      payInvoice(user.id, invoice.id, { accountId: foreign.id, ...payment }),
    ).rejects.toThrow(NotFoundError);
    expect(await balanceOf(foreign.id)).toBe("1000.00");
  });

  it("recusa fatura de outro usuário", async () => {
    const { invoice, account } = await scenario();
    const intruder = await makeUser();

    await expect(
      payInvoice(intruder.id, invoice.id, { accountId: account.id, ...payment }),
    ).rejects.toThrow(NotFoundError);
  });

  it("não deixa saldo inconsistente quando o câmbio falha", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { currency: "BRL", initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id, { currency: "USD", closingDay: 20, dueDay: 5 });

    await createCardPurchase(user.id, {
      creditCardId: card.id,
      categoryId: null,
      description: "Compra",
      amount: 100,
      currency: "USD",
      date: "2026-08-15",
      installments: 1,
      manualFxRate: null,
    });
    const [invoice] = await listCardInvoices(user.id, card.id);

    setFxAvailable(false);

    await expect(
      payInvoice(user.id, invoice!.id, { accountId: account.id, ...payment }),
    ).rejects.toThrow();

    expect(await balanceOf(account.id)).toBe("1000.00");
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } });
    expect(after.status).toBe("OPEN");
  });
});

describe("desfazer pagamento", () => {
  it("devolve o valor à conta e reabre a fatura", async () => {
    const { user, account, invoice } = await scenario({ amount: 250 });

    await payInvoice(user.id, invoice.id, { accountId: account.id, ...payment });
    expect(await balanceOf(account.id)).toBe("750.00");

    await undoInvoicePayment(user.id, invoice.id);

    expect(await balanceOf(account.id)).toBe("1000.00");
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe("OPEN");
    expect(after.paidAt).toBeNull();
    expect(after.paymentAccountId).toBeNull();
    expect(after.totalAmount.toFixed(2)).toBe("250.00");
    await expect(
      prisma.transaction.count({ where: { type: "INVOICE_PAYMENT" } }),
    ).resolves.toBe(0);
  });

  it("dois undos simultâneos creditam a conta uma única vez", async () => {
    const { user, account, invoice } = await scenario({ amount: 250 });

    await payInvoice(user.id, invoice.id, { accountId: account.id, ...payment });

    const results = await Promise.allSettled([
      undoInvoicePayment(user.id, invoice.id),
      undoInvoicePayment(user.id, invoice.id),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await balanceOf(account.id)).toBe("1000.00");
    expect((await recomputeBalance(account.id)).toFixed(2)).toBe("1000.00");
  });

  it("permite pagar de novo, por outra conta", async () => {
    const { user, account, invoice } = await scenario({ amount: 250 });
    const outra = await makeAccount(user.id, { name: "Outra", initialBalance: "800.00" });

    await payInvoice(user.id, invoice.id, { accountId: account.id, ...payment });
    await undoInvoicePayment(user.id, invoice.id);
    await payInvoice(user.id, invoice.id, { accountId: outra.id, ...payment });

    expect(await balanceOf(account.id)).toBe("1000.00");
    expect(await balanceOf(outra.id)).toBe("550.00");
  });

  it("recusa desfazer fatura que não está paga", async () => {
    const { user, invoice } = await scenario();

    await expect(undoInvoicePayment(user.id, invoice.id)).rejects.toThrow(
      /não está paga/,
    );
  });

  it("recusa fatura de outro usuário", async () => {
    const { user, account, invoice } = await scenario();
    const intruder = await makeUser();

    await payInvoice(user.id, invoice.id, { accountId: account.id, ...payment });

    await expect(undoInvoicePayment(intruder.id, invoice.id)).rejects.toThrow(NotFoundError);
    expect(await balanceOf(account.id)).toBe("750.00");
  });
});
