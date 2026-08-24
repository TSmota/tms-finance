import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { FxUnavailableError } from "@/lib/fxService";
import {
  createCardPurchase,
  deleteCardPurchase,
  updateCardPurchase,
} from "@/lib/cardPurchases";
import { listCardInvoices, listInvoiceItems } from "@/lib/invoices";
import { payInvoice } from "@/lib/invoicePayments";
import type { CardPurchaseInput } from "@/lib/validations";
import { makeAccount, makeCategory, makeCreditCard, makeUser } from "../factories";
import { setFxAvailable, setRates } from "../setup-fx";

/**
 * Compras no cartão e parcelamento.
 *
 * O que estes testes protegem: a compra parcelada cair nas faturas certas com a
 * soma exata, o saldo da conta bancária **não** se mexer, e a fatura ser única
 * por ciclo mesmo com várias compras.
 */

function purchaseInput(
  overrides: Partial<CardPurchaseInput> & { creditCardId: string },
): CardPurchaseInput {
  return {
    categoryId: null,
    description: "Compra de teste",
    amount: 100,
    currency: "BRL",
    date: "2026-08-15",
    installments: 1,
    manualFxRate: null,
    ...overrides,
  };
}

/** Faturas do cartão em ordem cronológica, com total e contagem. */
async function invoices(userId: string, cardId: string) {
  const list = await listCardInvoices(userId, cardId);

  return list
    .slice()
    .reverse()
    .map((invoice) => ({
      competencia: `${invoice.year}-${String(invoice.month).padStart(2, "0")}`,
      total: invoice.total.toFixed(2),
      itens: invoice.itemCount,
      status: invoice.status,
    }));
}

beforeEach(() => {
  setFxAvailable(true);
  setRates({ "USD->BRL": 5.4, "BRL->USD": 0.1852 });
});

describe("compra à vista", () => {
  it("cria uma fatura na competência da compra", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(user.id, purchaseInput({ creditCardId: card.id, amount: 250.5 }));

    expect(await invoices(user.id, card.id)).toEqual([
      { competencia: "2026-08", total: "250.50", itens: 1, status: "OPEN" },
    ]);
  });

  it("não altera o saldo da conta bancária", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id);

    await createCardPurchase(user.id, purchaseInput({ creditCardId: card.id, amount: 500 }));

    const stored = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { currentBalance: true },
    });
    expect(stored.currentBalance.toFixed(2)).toBe("1000.00");
  });

  it("não marca parcelamento quando é uma parcela só", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);

    const [created] = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, installments: 1 }),
    );

    expect(created?.installmentNumber).toBe(1);
    expect(created?.totalInstallments).toBe(1);
    expect(created?.parentInstallmentId).toBeNull();
  });
});

describe("regra do dia de fechamento", () => {
  it("compra no dia do fechamento entra na fatura do mês", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, date: "2026-08-20" }),
    );

    expect((await invoices(user.id, card.id))[0]?.competencia).toBe("2026-08");
  });

  it("compra depois do fechamento entra na fatura seguinte", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, date: "2026-08-21" }),
    );

    expect((await invoices(user.id, card.id))[0]?.competencia).toBe("2026-09");
  });

  it("grava as datas efetivas do ciclo, com vencimento no mês seguinte", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, date: "2026-08-10" }),
    );

    const [invoice] = await listCardInvoices(user.id, card.id);
    expect(invoice?.closingDate.toISOString().slice(0, 10)).toBe("2026-08-20");
    expect(invoice?.dueDate.toISOString().slice(0, 10)).toBe("2026-09-05");
  });
});

describe("compra parcelada", () => {
  it("distribui 100,00 em 3x pelas faturas consecutivas, com o resto na primeira", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 100, installments: 3, date: "2026-08-15" }),
    );

    expect(await invoices(user.id, card.id)).toEqual([
      { competencia: "2026-08", total: "33.34", itens: 1, status: "OPEN" },
      { competencia: "2026-09", total: "33.33", itens: 1, status: "OPEN" },
      { competencia: "2026-10", total: "33.33", itens: 1, status: "OPEN" },
    ]);
  });

  it("numera as parcelas e ancora todas na primeira", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);

    const created = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 100, installments: 3 }),
    );

    expect(created.map((item) => item.installmentNumber)).toEqual([1, 2, 3]);
    expect(created.every((item) => item.totalInstallments === 3)).toBe(true);
    expect(created[0]?.parentInstallmentId).toBeNull();
    expect(created[1]?.parentInstallmentId).toBe(created[0]?.id);
    expect(created[2]?.parentInstallmentId).toBe(created[0]?.id);
  });

  it("a soma das parcelas é exatamente o total da compra", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);

    const created = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 100, installments: 7 }),
    );

    const soma = created.reduce((total, item) => total + Number(item.convertedAmount), 0);
    expect(soma.toFixed(2)).toBe("100.00");
  });

  it("vira o ano ao parcelar em dezembro", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 300, installments: 3, date: "2026-12-10" }),
    );

    expect((await invoices(user.id, card.id)).map((item) => item.competencia)).toEqual([
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("começa na fatura seguinte quando a compra é depois do fechamento", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 300, installments: 3, date: "2026-08-25" }),
    );

    expect((await invoices(user.id, card.id)).map((item) => item.competencia)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
  });

  it("recusa parcelamento inviável sem criar fatura alguma", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);

    await expect(
      createCardPurchase(
        user.id,
        purchaseInput({ creditCardId: card.id, amount: 0.01, installments: 3 }),
      ),
    ).rejects.toThrow(InvalidOperationError);

    // A validação acontece antes de abrir a transação: nada foi criado.
    await expect(prisma.invoice.count()).resolves.toBe(0);
    await expect(prisma.transaction.count()).resolves.toBe(0);
  });
});

describe("fatura única por ciclo", () => {
  it("duas compras no mesmo ciclo reutilizam a mesma fatura", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 100, date: "2026-08-05" }),
    );
    await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 50, date: "2026-08-12" }),
    );

    expect(await invoices(user.id, card.id)).toEqual([
      { competencia: "2026-08", total: "150.00", itens: 2, status: "OPEN" },
    ]);
    await expect(prisma.invoice.count()).resolves.toBe(1);
  });

  it("compras simultâneas no mesmo ciclo não duplicam a fatura", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    // O upsert em resolveInvoice existe justamente para esta corrida.
    await Promise.all([
      createCardPurchase(user.id, purchaseInput({ creditCardId: card.id, amount: 10 })),
      createCardPurchase(user.id, purchaseInput({ creditCardId: card.id, amount: 20 })),
      createCardPurchase(user.id, purchaseInput({ creditCardId: card.id, amount: 30 })),
    ]);

    await expect(prisma.invoice.count()).resolves.toBe(1);
    expect((await invoices(user.id, card.id))[0]).toMatchObject({
      total: "60.00",
      itens: 3,
    });
  });

  it("cartões diferentes têm faturas independentes no mesmo mês", async () => {
    const user = await makeUser();
    const first = await makeCreditCard(user.id, { name: "Cartão A", closingDay: 20, dueDay: 5 });
    const second = await makeCreditCard(user.id, { name: "Cartão B", closingDay: 28, dueDay: 10 });

    await createCardPurchase(user.id, purchaseInput({ creditCardId: first.id, amount: 100 }));
    await createCardPurchase(user.id, purchaseInput({ creditCardId: second.id, amount: 200 }));

    await expect(prisma.invoice.count()).resolves.toBe(2);
    expect((await invoices(user.id, first.id))[0]?.total).toBe("100.00");
    expect((await invoices(user.id, second.id))[0]?.total).toBe("200.00");
  });
});

describe("compra em moeda estrangeira", () => {
  it("converte para a moeda do cartão e mantém a relação por linha", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { currency: "BRL" });

    const [created] = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 15, currency: "USD" }),
    );

    expect(created?.amount.toFixed(2)).toBe("15.00");
    expect(created?.currency).toBe("USD");
    expect(created?.exchangeRate.toFixed(4)).toBe("5.4000");
    expect(created?.convertedAmount.toFixed(2)).toBe("81.00");

    // A fatura soma o valor convertido, na moeda do cartão.
    expect((await invoices(user.id, card.id))[0]?.total).toBe("81.00");
  });

  it("mantém amount × taxa = convertedAmount em cada parcela", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { currency: "BRL" });

    const created = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 100, currency: "USD", installments: 3 }),
    );

    for (const parcela of created) {
      const esperado = Number(parcela.amount) * Number(parcela.exchangeRate);
      expect(Number(parcela.convertedAmount).toFixed(2)).toBe(esperado.toFixed(2));
    }
  });

  it("usa a taxa já arredondada às 4 casas da coluna", async () => {
    // A coluna é DECIMAL(10,4). Converter com a taxa cheia e gravar a
    // arredondada quebraria `amount × exchangeRate = convertedAmount`: aqui
    // seriam 5123,46 gravados contra 5123,50 verdadeiros.
    setRates({ "USD->BRL": 5.123456 });

    const user = await makeUser();
    const card = await makeCreditCard(user.id, { currency: "BRL" });

    const [created] = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 1000, currency: "USD" }),
    );

    expect(created?.exchangeRate.toFixed(4)).toBe("5.1235");
    expect(created?.convertedAmount.toFixed(2)).toBe("5123.50");
    expect(created?.amount.times(created.exchangeRate).toFixed(2)).toBe(
      created?.convertedAmount.toFixed(2),
    );
  });

  it("aplica o mesmo arredondamento à taxa manual", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { currency: "BRL" });

    const [created] = await createCardPurchase(
      user.id,
      purchaseInput({
        creditCardId: card.id,
        amount: 1000,
        currency: "USD",
        manualFxRate: 5.12345678,
      }),
    );

    expect(created?.exchangeRate.toFixed(4)).toBe("5.1235");
    expect(created?.convertedAmount.toFixed(2)).toBe("5123.50");
  });

  it("falha sem criar nada quando o câmbio está indisponível", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { currency: "BRL" });
    setFxAvailable(false);

    await expect(
      createCardPurchase(user.id, purchaseInput({ creditCardId: card.id, currency: "USD" })),
    ).rejects.toThrow(FxUnavailableError);

    await expect(prisma.invoice.count()).resolves.toBe(0);
    await expect(prisma.transaction.count()).resolves.toBe(0);
  });
});

describe("exclusão de compra parcelada", () => {
  it("remove todas as parcelas e reajusta os totais das faturas", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    const created = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 100, installments: 3, date: "2026-08-15" }),
    );
    // Uma segunda compra na primeira fatura, que precisa sobreviver.
    await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 40, date: "2026-08-16" }),
    );

    // Apagar pela parcela do meio deve levar o grupo inteiro.
    await deleteCardPurchase(user.id, created[1]!.id);

    expect(await invoices(user.id, card.id)).toEqual([
      { competencia: "2026-08", total: "40.00", itens: 1, status: "OPEN" },
      { competencia: "2026-09", total: "0.00", itens: 0, status: "OPEN" },
      { competencia: "2026-10", total: "0.00", itens: 0, status: "OPEN" },
    ]);
  });

  it("remove o grupo inteiro ao apagar pela primeira parcela", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);

    const created = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 100, installments: 3 }),
    );

    await deleteCardPurchase(user.id, created[0]!.id);

    await expect(prisma.transaction.count()).resolves.toBe(0);
  });

  it("recusa lançamento de outro usuário", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const card = await makeCreditCard(owner.id);
    const [created] = await createCardPurchase(owner.id, purchaseInput({ creditCardId: card.id }));

    await expect(deleteCardPurchase(intruder.id, created!.id)).rejects.toThrow(NotFoundError);
    await expect(prisma.transaction.count()).resolves.toBe(1);
  });

  it("recusa apagar compra que está em fatura paga", async () => {
    // O dinheiro já saiu da conta pelo total antigo: apagar a linha deixaria a
    // fatura PAID com `total_amount` menor do que o valor debitado.
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    const [created] = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 250 }),
    );

    const [invoice] = await listCardInvoices(user.id, card.id);

    await payInvoice(user.id, invoice!.id, {
      accountId: account.id,
      date: "2026-09-05",
      manualFxRate: null,
    });

    await expect(deleteCardPurchase(user.id, created!.id)).rejects.toThrow(
      InvalidOperationError,
    );

    expect((await invoices(user.id, card.id))[0]).toMatchObject({
      total: "250.00",
      itens: 2,
      status: "PAID",
    });
  });

  it("recusa apagar quando só uma das parcelas caiu em fatura paga", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    const created = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 300, installments: 3 }),
    );

    // Paga só a primeira fatura; as parcelas 2 e 3 seguem em faturas abertas.
    const list = await listCardInvoices(user.id, card.id);
    const first = list[list.length - 1]!;

    await payInvoice(user.id, first.id, {
      accountId: account.id,
      date: "2026-09-05",
      manualFxRate: null,
    });

    // Apagar pela parcela 3, que está em fatura aberta, ainda leva o grupo todo
    // — e o grupo inclui a parcela paga.
    await expect(deleteCardPurchase(user.id, created[2]!.id)).rejects.toThrow(
      InvalidOperationError,
    );

    await expect(
      prisma.transaction.count({ where: { userId: user.id, creditCardId: card.id } }),
    ).resolves.toBe(3);
  });
});

describe("isolamento e listagem", () => {
  it("recusa cartão de outro usuário", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const card = await makeCreditCard(owner.id);

    await expect(
      createCardPurchase(intruder.id, purchaseInput({ creditCardId: card.id })),
    ).rejects.toThrow(NotFoundError);
  });

  it("recusa categoria de outro usuário", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const card = await makeCreditCard(user.id);
    const foreign = await makeCategory(other.id);

    await expect(
      createCardPurchase(
        user.id,
        purchaseInput({ creditCardId: card.id, categoryId: foreign.id }),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("lista os itens da fatura com categoria e marcação de parcela", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });
    const category = await makeCategory(user.id, { name: "Eletrônicos", color: "#adb5bd" });

    await createCardPurchase(
      user.id,
      purchaseInput({
        creditCardId: card.id,
        amount: 100,
        installments: 3,
        categoryId: category.id,
        description: "Fone de ouvido",
        date: "2026-08-15",
      }),
    );

    const [invoice] = (await listCardInvoices(user.id, card.id)).slice(-1);
    const items = await listInvoiceItems(user.id, invoice!.id);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      description: "Fone de ouvido",
      categoryName: "Eletrônicos",
      categoryColor: "#adb5bd",
      installmentNumber: 1,
      totalInstallments: 3,
      convertedAmount: 33.34,
    });
  });
});

describe("edição da compra", () => {
  /** Parcelas do grupo em ordem, com a competência da fatura de cada uma. */
  async function group(userId: string) {
    const rows = await prisma.transaction.findMany({
      where: { userId, creditCardId: { not: null }, type: { not: "INVOICE_PAYMENT" } },
      orderBy: { installmentNumber: "asc" },
      include: { invoice: { select: { year: true, month: true } } },
    });

    return rows.map((row) => ({
      parcela: `${row.installmentNumber}/${row.totalInstallments}`,
      valor: row.convertedAmount.toFixed(2),
      competencia: `${row.invoice!.year}-${String(row.invoice!.month).padStart(2, "0")}`,
      descricao: row.description,
    }));
  }

  it("ajusta o valor e recalcula o total da fatura", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    const [purchase] = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 39.9, description: "Streaming" }),
    );

    await updateCardPurchase(
      user.id,
      purchase!.id,
      purchaseInput({
        creditCardId: card.id,
        amount: 44.9,
        description: "Streaming (reajuste)",
      }),
    );

    expect(await group(user.id)).toEqual([
      { parcela: "1/1", valor: "44.90", competencia: "2026-08", descricao: "Streaming (reajuste)" },
    ]);
    expect(await invoices(user.id, card.id)).toEqual([
      { competencia: "2026-08", total: "44.90", itens: 1, status: "OPEN" },
    ]);
  });

  it("editar qualquer parcela reescreve o grupo inteiro", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    const created = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 100, installments: 3 }),
    );

    // Clica na 2ª parcela, mas o valor informado é o total da compra.
    await updateCardPurchase(
      user.id,
      created[1]!.id,
      purchaseInput({ creditCardId: card.id, amount: 200, installments: 3 }),
    );

    const rows = await group(user.id);

    expect(rows.map((row) => `${row.parcela} ${row.valor} ${row.competencia}`)).toEqual([
      "1/3 66.68 2026-08",
      "2/3 66.66 2026-09",
      "3/3 66.66 2026-10",
    ]);
    // A soma das parcelas continua exatamente o total.
    expect(rows.reduce((total, row) => total + Number(row.valor), 0)).toBeCloseTo(200, 2);
  });

  it("mudar o número de parcelas redistribui pelas faturas", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    const created = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 90, installments: 3 }),
    );

    await updateCardPurchase(
      user.id,
      created[0]!.id,
      purchaseInput({ creditCardId: card.id, amount: 90, installments: 2 }),
    );

    expect(await group(user.id)).toHaveLength(2);
    // A fatura de outubro perdeu sua parcela e foi zerada, não ficou órfã.
    expect(await invoices(user.id, card.id)).toEqual([
      { competencia: "2026-08", total: "45.00", itens: 1, status: "OPEN" },
      { competencia: "2026-09", total: "45.00", itens: 1, status: "OPEN" },
      { competencia: "2026-10", total: "0.00", itens: 0, status: "OPEN" },
    ]);
  });

  it("mudar a data move a compra para a fatura do novo ciclo", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    const [purchase] = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 50, date: "2026-08-15" }),
    );

    // Depois do fechamento: a compra passa para a fatura de setembro.
    await updateCardPurchase(
      user.id,
      purchase!.id,
      purchaseInput({ creditCardId: card.id, amount: 50, date: "2026-08-25" }),
    );

    expect(await invoices(user.id, card.id)).toEqual([
      { competencia: "2026-08", total: "0.00", itens: 0, status: "OPEN" },
      { competencia: "2026-09", total: "50.00", itens: 1, status: "OPEN" },
    ]);
  });

  it("recusa editar compra de fatura paga", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    const [purchase] = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 50 }),
    );

    const [invoice] = await listCardInvoices(user.id, card.id);

    await payInvoice(user.id, invoice!.id, {
      accountId: account.id,
      date: "2026-09-05",
      manualFxRate: null,
    });

    await expect(
      updateCardPurchase(
        user.id,
        purchase!.id,
        purchaseInput({ creditCardId: card.id, amount: 80 }),
      ),
    ).rejects.toThrow(InvalidOperationError);

    // Nada mudou: nem o lançamento, nem o total, nem o saldo debitado.
    expect(await invoices(user.id, card.id)).toEqual([
      { competencia: "2026-08", total: "50.00", itens: 2, status: "PAID" },
    ]);

    const stored = await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });

    expect(stored.currentBalance.toFixed(2)).toBe("950.00");
  });

  it("não move o saldo da conta bancária", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id);

    const [purchase] = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 50 }),
    );

    await updateCardPurchase(
      user.id,
      purchase!.id,
      purchaseInput({ creditCardId: card.id, amount: 500 }),
    );

    const stored = await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });

    expect(stored.currentBalance.toFixed(2)).toBe("1000.00");
  });

  it("converte pela nova moeda quando ela muda", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { currency: "BRL" });

    const [purchase] = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 100, currency: "BRL" }),
    );

    await updateCardPurchase(
      user.id,
      purchase!.id,
      purchaseInput({ creditCardId: card.id, amount: 25, currency: "USD" }),
    );

    const [row] = await prisma.transaction.findMany({ where: { userId: user.id } });

    expect(row!.amount.toFixed(2)).toBe("25.00");
    expect(row!.exchangeRate.toFixed(4)).toBe("5.4000");
    expect(row!.convertedAmount.toFixed(2)).toBe("135.00");
  });

  it("move a compra para outro cartão, recalculando as duas faturas", async () => {
    const user = await makeUser();
    const origin = await makeCreditCard(user.id, { name: "Origem", closingDay: 20, dueDay: 5 });
    const target = await makeCreditCard(user.id, { name: "Destino", closingDay: 20, dueDay: 5 });

    const [purchase] = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: origin.id, amount: 70 }),
    );

    await updateCardPurchase(
      user.id,
      purchase!.id,
      purchaseInput({ creditCardId: target.id, amount: 70 }),
    );

    expect(await invoices(user.id, origin.id)).toEqual([
      { competencia: "2026-08", total: "0.00", itens: 0, status: "OPEN" },
    ]);
    expect(await invoices(user.id, target.id)).toEqual([
      { competencia: "2026-08", total: "70.00", itens: 1, status: "OPEN" },
    ]);
  });

  it("compra de outro usuário é inacessível", async () => {
    const user = await makeUser();
    const intruder = await makeUser();
    const card = await makeCreditCard(user.id);

    const [purchase] = await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 50 }),
    );

    await expect(
      updateCardPurchase(
        intruder.id,
        purchase!.id,
        purchaseInput({ creditCardId: card.id, amount: 1 }),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("expõe o total do grupo na listagem, não o valor da parcela", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(
      user.id,
      purchaseInput({ creditCardId: card.id, amount: 100, installments: 3 }),
    );

    const all = await listCardInvoices(user.id, card.id);
    const september = all.find((invoice) => invoice.month === 9)!;
    const [item] = await listInvoiceItems(user.id, september.id);

    // A parcela vale 33,33, mas o formulário de edição precisa do total.
    expect(item!.amount).toBe(33.33);
    expect(item!.groupTotal).toBe(100);
    expect(item!.installmentNumber).toBe(2);
    expect(item!.fromRecurring).toBe(false);
  });
});
