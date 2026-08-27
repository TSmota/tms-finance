import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { recomputeBalance } from "@/lib/accountBalance";
import {
  createDebt,
  deleteDebt,
  deleteSettlement,
  getDebtDetail,
  listDebts,
  settleDebt,
  updateDebt,
} from "@/lib/debts";
import { payInvoice } from "@/lib/invoicePayments";
import { getPeopleOverview, deletePerson } from "@/lib/people";
import {
  makeAccount,
  makeCategory,
  makeCreditCard,
  makePerson,
  makeUser,
} from "@tests/support/factories";
import { debtInput, debtSettlementInput } from "@tests/support/inputs";
import { expectBalance } from "@tests/support/money";
import { setFxAvailable, setRates } from "@tests/setup-fx";

/**
 * Empréstimos e dívidas pessoais.
 *
 * O que estes testes protegem: as duas pontas andarem sempre juntas — saldo da
 * conta e `remainingAmount` — e o `status` ser derivado, nunca inventado. A
 * única forma de verificar isso é conferindo os dois lados depois de cada
 * operação.
 */

/** Cenário mínimo: usuário, conta com saldo, categoria de origem e pessoa. */
async function scenario(options: { initialBalance?: string; currency?: "BRL" | "USD" } = {}) {
  const user = await makeUser();
  const account = await makeAccount(user.id, {
    initialBalance: options.initialBalance ?? "1000.00",
    currency: options.currency ?? "BRL",
  });
  const category = await makeCategory(user.id, { name: "Viagem" });
  const person = await makePerson(user.id, { name: "Alice" });

  return { user, account, category, person };
}

/** Cenário com cartão: fecha dia 20, vence dia 5. */
async function cardScenario(options: { currency?: "BRL" | "USD" } = {}) {
  const shared = await scenario();
  const card = await makeCreditCard(shared.user.id, {
    name: "Nubank",
    closingDay: 20,
    dueDay: 5,
    currency: options.currency ?? "BRL",
  });

  return { ...shared, card };
}

/** Faturas do cartão, em ordem de competência, com o total de cada uma. */
async function invoices(cardId: string) {
  const rows = await prisma.invoice.findMany({
    where: { creditCardId: cardId },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  return rows.map((row) => ({
    competencia: `${row.year}-${String(row.month).padStart(2, "0")}`,
    total: row.totalAmount.toFixed(2),
    status: row.status,
  }));
}

/** Estado das duas pontas, para asserção em uma linha. */
async function state(userId: string, debtId: string, accountId: string) {
  const debt = await prisma.debt.findUniqueOrThrow({ where: { id: debtId } });
  const account = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } });

  return {
    total: debt.originalAmount.toFixed(2),
    restante: debt.remainingAmount.toFixed(2),
    status: debt.status,
    saldo: account.currentBalance.toFixed(2),
    // Prova que o denormalizado bate com a soma dos lançamentos.
    saldoRecalculado: (await recomputeBalance(accountId)).toFixed(2),
  };
}

beforeEach(() => {
  setRates({ "USD->BRL": 5.4, "BRL->USD": 0.1852 });
});

describe("origem no cartão", () => {
  it("lança a origem na fatura e não move saldo de conta", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 300,
        // Dia 6 é antes do fechamento (20): entra na fatura de agosto.
        date: "2026-08-06",
      }),
    );

    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "300.00", status: "OPEN" },
    ]);

    // O dinheiro só sai quando a fatura é paga.
    const saldo = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
    });

    expect(saldo.currentBalance.toFixed(2)).toBe("1000.00");
    expect(await recomputeBalance(account.id)).toEqual(saldo.currentBalance);

    const origin = await prisma.transaction.findFirstOrThrow({
      where: { debtId: debt.id },
    });

    expect(origin.accountId).toBeNull();
    expect(origin.creditCardId).toBe(card.id);
    expect(origin.categoryId).toBe(category.id);
    expect(origin.type).toBe("EXPENSE");
  });

  it("compra depois do fechamento cai na fatura do mês seguinte", async () => {
    const { user, category, person, card } = await cardScenario();

    await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 100,
        // Dia 21 é depois do fechamento (20).
        date: "2026-08-21",
      }),
    );

    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-09", total: "100.00", status: "OPEN" },
    ]);
  });

  it("parcela em faturas consecutivas, com os centavos na primeira", async () => {
    const { user, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 100,
        installments: 3,
        date: "2026-08-06",
      }),
    );

    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "33.34", status: "OPEN" },
      { competencia: "2026-09", total: "33.33", status: "OPEN" },
      { competencia: "2026-10", total: "33.33", status: "OPEN" },
    ]);

    const parcelas = await prisma.transaction.findMany({
      where: { debtId: debt.id },
      orderBy: { installmentNumber: "asc" },
    });

    expect(
      parcelas.map((row) => ({
        n: row.installmentNumber,
        de: row.totalInstallments,
        valor: row.amount.toFixed(2),
        data: row.date.toISOString().slice(0, 10),
      })),
    ).toEqual([
      { n: 1, de: 3, valor: "33.34", data: "2026-08-06" },
      { n: 2, de: 3, valor: "33.33", data: "2026-08-06" },
      { n: 3, de: 3, valor: "33.33", data: "2026-08-06" },
    ]);

    // A 1ª parcela é a âncora; as seguintes apontam para ela.
    const ancora = parcelas[0]!;

    expect(ancora.parentInstallmentId).toBeNull();
    expect(parcelas.slice(1).every((row) => row.parentInstallmentId === ancora.id)).toBe(true);

    // A soma das parcelas é exatamente o total da dívida.
    const gravada = await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } });

    expect(gravada.originalAmount.toFixed(2)).toBe("100.00");
  });

  it("recusa BORROWED com origem no cartão", async () => {
    const { user, category, person, card } = await cardScenario();

    await expect(
      createDebt(
        user.id,
        debtInput({
          personId: person.id,
          categoryId: category.id,
          creditCardId: card.id,
          type: "BORROWED",
        }),
      ),
    ).rejects.toThrow();

    expect(await invoices(card.id)).toEqual([]);
  });

  it("recusa cartão de outro usuário", async () => {
    const { user, category, person } = await cardScenario();
    const outro = await makeUser();
    const cartaoAlheio = await makeCreditCard(outro.id);

    await expect(
      createDebt(
        user.id,
        debtInput({
          personId: person.id,
          categoryId: category.id,
          creditCardId: cartaoAlheio.id,
        }),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("amortiza em conta uma dívida originada no cartão", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 300,
        date: "2026-08-06",
      }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 120 }));

    expect(await state(user.id, debt.id, account.id)).toMatchObject({
      total: "300.00",
      restante: "180.00",
      status: "PARTIALLY_PAID",
      // O recebimento entra na conta; a fatura não é tocada.
      saldo: "1120.00",
    });

    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "300.00", status: "OPEN" },
    ]);
  });
});

describe("empréstimo feito (LENT)", () => {
  it("debita a conta e abre a dívida com a categoria de origem", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "200.00",
      restante: "200.00",
      status: "PENDING",
      saldo: "800.00",
      saldoRecalculado: "800.00",
    });

    const [origin] = await prisma.transaction.findMany({ where: { debtId: debt.id } });

    expect(origin!.type).toBe("EXPENSE");
    expect(origin!.categoryId).toBe(category.id);
    expect(origin!.convertedAmount.toFixed(2)).toBe("200.00");
  });

  it("receber parte deixa a dívida parcial e credita a conta", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 80 }));

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "200.00",
      restante: "120.00",
      status: "PARTIALLY_PAID",
      saldo: "880.00",
      saldoRecalculado: "880.00",
    });
  });

  it("receber o restante quita a dívida", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 80 }));
    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 120 }));

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "200.00",
      restante: "0.00",
      status: "PAID",
      // 1000 − 200 + 80 + 120: o dinheiro voltou inteiro.
      saldo: "1000.00",
      saldoRecalculado: "1000.00",
    });
  });

  it("a amortização herda a categoria de origem quando nenhuma é informada", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id }));

    const { movements } = await getDebtDetail(user.id, debt.id);

    expect(movements.map((movement) => movement.categoryName)).toEqual(["Viagem", "Viagem"]);
  });

  it("a amortização aceita categoria própria", async () => {
    const { user, account, category, person } = await scenario();
    const other = await makeCategory(user.id, { name: "Reembolso" });

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(
      user.id,
      debt.id,
      debtSettlementInput({ accountId: account.id, categoryId: other.id }),
    );

    const { movements } = await getDebtDetail(user.id, debt.id);

    expect(movements.map((movement) => movement.categoryName)).toEqual(["Viagem", "Reembolso"]);
  });
});

describe("empréstimo recebido (BORROWED)", () => {
  it("espelha os sinais: o dinheiro entra e cria saldo a pagar", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        type: "BORROWED",
        amount: 300,
      }),
    );

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "300.00",
      restante: "300.00",
      status: "PENDING",
      saldo: "1300.00",
      saldoRecalculado: "1300.00",
    });

    const [origin] = await prisma.transaction.findMany({ where: { debtId: debt.id } });

    expect(origin!.type).toBe("INCOME");
  });

  it("pagar abate a dívida e debita a conta", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        type: "BORROWED",
        amount: 300,
      }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 100 }));

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "300.00",
      restante: "200.00",
      status: "PARTIALLY_PAID",
      saldo: "1200.00",
      saldoRecalculado: "1200.00",
    });

    const settlement = await prisma.transaction.findFirstOrThrow({
      where: { debtId: debt.id, type: "EXPENSE" },
    });

    expect(settlement.convertedAmount.toFixed(2)).toBe("100.00");
  });
});

describe("limites da amortização", () => {
  it("recusa abater mais do que o restante, sem mexer em nada", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 80 }));

    await expect(
      settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 120.01 })),
    ).rejects.toThrow(InvalidOperationError);

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "200.00",
      restante: "120.00",
      status: "PARTIALLY_PAID",
      saldo: "880.00",
      saldoRecalculado: "880.00",
    });
    expect(await prisma.transaction.count({ where: { debtId: debt.id } })).toBe(2);
  });

  it("recusa amortizar dívida já quitada", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 200 }));

    await expect(
      settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 1 })),
    ).rejects.toThrow(InvalidOperationError);
  });

  it("abater exatamente o restante é aceito", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        amount: 0.03,
      }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 0.01 }));
    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 0.02 }));

    expect(await state(user.id, debt.id, account.id)).toMatchObject({
      restante: "0.00",
      status: "PAID",
    });
  });

  it("duas amortizações simultâneas do restante inteiro: só uma passa", async () => {
    // A recheca de `remainingAmount` fora da transação não basta: sob READ
    // COMMITTED as duas leem 200 e as duas creditam a conta. Só o FOR UPDATE de
    // `lockDebt` serializa — e este é o único dos quatro locks do código sem
    // prova até aqui.
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    const results = await Promise.allSettled([
      settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 200 })),
      settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 200 })),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "200.00",
      restante: "0.00",
      status: "PAID",
      // 1000 − 200 + 200: creditada uma vez só.
      saldo: "1000.00",
      saldoRecalculado: "1000.00",
    });
  });
});

describe("remoção", () => {
  it("remover uma amortização devolve o valor ao restante e reverte o saldo", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    const settlement = await settleDebt(
      user.id,
      debt.id,
      debtSettlementInput({ accountId: account.id, amount: 80 }),
    );

    await deleteSettlement(user.id, settlement.id);

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "200.00",
      restante: "200.00",
      status: "PENDING",
      saldo: "800.00",
      saldoRecalculado: "800.00",
    });
  });

  it("não estorna saldo de amortização pendente", async () => {
    // Uma amortização `PENDING` nunca somou ao saldo. Estorná-la assim mesmo
    // criaria dinheiro do nada. Os serviços não criam amortização pendente
    // hoje, mas o schema permite e a superfície MCP grava direto.
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    const settlement = await settleDebt(
      user.id,
      debt.id,
      debtSettlementInput({ accountId: account.id, amount: 80 }),
    );

    // Desfaz o efeito no saldo e volta a linha para pendente, como se ela
    // nunca tivesse sido confirmada.
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: settlement.id },
        data: { status: "PENDING" },
      }),
      prisma.financialAccount.update({
        where: { id: account.id },
        data: { currentBalance: "800.00" },
      }),
    ]);

    await deleteSettlement(user.id, settlement.id);

    const stored = await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });

    expect(stored.currentBalance.toFixed(2)).toBe("800.00");
    await expectBalance(account.id, "800.00");
  });

  it("recusa remover a movimentação de origem por esse caminho", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    const origin = await prisma.transaction.findFirstOrThrow({ where: { debtId: debt.id } });

    await expect(deleteSettlement(user.id, origin.id)).rejects.toThrow(InvalidOperationError);
  });

  it("remover a dívida apaga todas as movimentações e devolve o saldo", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 80 }));
    await deleteDebt(user.id, debt.id);

    expect(await prisma.debt.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(0);

    const stored = await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });

    expect(stored.currentBalance.toFixed(2)).toBe("1000.00");
  });
});

describe("edição da dívida", () => {
  it("conta → cartão: estorna o saldo e abre a fatura", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    expect(await state(user.id, debt.id, account.id)).toMatchObject({ saldo: "800.00" });

    await updateDebt(
      user.id,
      debt.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    // O saldo volta ao que era: o dinheiro agora sai quando a fatura for paga.
    expect(await state(user.id, debt.id, account.id)).toMatchObject({
      total: "200.00",
      restante: "200.00",
      saldo: "1000.00",
    });
    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "200.00", status: "OPEN" },
    ]);
    expect(await recomputeBalance(account.id)).toEqual(
      (await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } }))
        .currentBalance,
    );
  });

  it("cartão → conta: recalcula a fatura, apaga a que ficou vazia e debita", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    await updateDebt(
      user.id,
      debt.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    // A fatura ficou sem lançamento nenhum e foi apagada.
    expect(await invoices(card.id)).toEqual([]);
    expect(await state(user.id, debt.id, account.id)).toMatchObject({
      total: "200.00",
      saldo: "800.00",
    });
  });

  it("cartão → cartão: 3x vira 6x e redistribui as faturas", async () => {
    const { user, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 90,
        installments: 3,
        date: "2026-08-06",
      }),
    );

    expect(await invoices(card.id)).toHaveLength(3);

    await updateDebt(
      user.id,
      debt.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 120,
        installments: 6,
        date: "2026-08-06",
      }),
    );

    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "20.00", status: "OPEN" },
      { competencia: "2026-09", total: "20.00", status: "OPEN" },
      { competencia: "2026-10", total: "20.00", status: "OPEN" },
      { competencia: "2026-11", total: "20.00", status: "OPEN" },
      { competencia: "2026-12", total: "20.00", status: "OPEN" },
      { competencia: "2027-01", total: "20.00", status: "OPEN" },
    ]);
  });

  it("preserva o valor já amortizado ao trocar de destino", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 80 }));

    await updateDebt(
      user.id,
      debt.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    expect(await state(user.id, debt.id, account.id)).toMatchObject({
      total: "200.00",
      restante: "120.00",
      status: "PARTIALLY_PAID",
      // 1000 − 200 (origem estornada) + 80 (amortização, intacta) = 1080.
      saldo: "1080.00",
    });
  });

  it("recusa editar dívida cuja origem está em fatura paga", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { creditCardId: card.id },
    });

    await payInvoice(user.id, invoice.id, {
      accountId: account.id,
      date: "2026-09-05",
      manualFxRate: null,
    });

    await expect(
      updateDebt(
        user.id,
        debt.id,
        debtInput({
          personId: person.id,
          categoryId: category.id,
          creditCardId: card.id,
          amount: 500,
          date: "2026-08-06",
        }),
      ),
    ).rejects.toThrow(InvalidOperationError);

    // Nada mudou: nem a dívida, nem a fatura.
    const gravada = await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } });

    expect(gravada.originalAmount.toFixed(2)).toBe("200.00");
    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "200.00", status: "PAID" },
    ]);
  });

  it("aumentar o total ajusta a origem, o restante e o saldo", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 80 }));

    await updateDebt(
      user.id,
      debt.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        amount: 300,
      }),
    );

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "300.00",
      // Os 80 já abatidos continuam abatidos: 300 − 80.
      restante: "220.00",
      status: "PARTIALLY_PAID",
      // 1000 − 300 + 80.
      saldo: "780.00",
      saldoRecalculado: "780.00",
    });
  });

  it("recusa total menor do que o já abatido", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 150 }));

    await expect(
      updateDebt(
        user.id,
        debt.id,
        debtInput({
          personId: person.id,
          categoryId: category.id,
          accountId: account.id,
          amount: 100,
        }),
      ),
    ).rejects.toThrow(InvalidOperationError);

    expect(await state(user.id, debt.id, account.id)).toMatchObject({
      total: "200.00",
      restante: "50.00",
    });
  });

  it("recusa trocar o tipo e a moeda", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    const base = {
      personId: person.id,
      categoryId: category.id,
      accountId: account.id,
    };

    await expect(
      updateDebt(user.id, debt.id, debtInput({ ...base, type: "BORROWED" })),
    ).rejects.toThrow(InvalidOperationError);

    await expect(
      updateDebt(user.id, debt.id, debtInput({ ...base, currency: "USD" })),
    ).rejects.toThrow(InvalidOperationError);
  });

  it("mudar a conta move o efeito de um saldo para o outro", async () => {
    const { user, account, category, person } = await scenario();
    const other = await makeAccount(user.id, { initialBalance: "500.00" });

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await updateDebt(
      user.id,
      debt.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: other.id }),
    );

    await expectBalance(account.id, "1000.00");
    await expectBalance(other.id, "300.00");

    const stored = await prisma.financialAccount.findMany({
      where: { userId: user.id },
      orderBy: { initialBalance: "desc" },
    });

    expect(stored.map((row) => row.currentBalance.toFixed(2))).toEqual(["1000.00", "300.00"]);
  });
});

describe("moedas", () => {
  it("dívida em USD numa conta BRL converte o saldo e mantém o restante em USD", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        currency: "USD",
        amount: 100,
      }),
    );

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "100.00",
      restante: "100.00",
      status: "PENDING",
      // 1000 − (100 × 5,40).
      saldo: "460.00",
      saldoRecalculado: "460.00",
    });

    // O abate é em USD, a moeda da dívida; o saldo se move em BRL.
    await settleDebt(
      user.id,
      debt.id,
      debtSettlementInput({ accountId: account.id, amount: 40, currency: "USD" }),
    );

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "100.00",
      restante: "60.00",
      status: "PARTIALLY_PAID",
      saldo: "676.00",
      saldoRecalculado: "676.00",
    });
  });

  it("amortização em BRL numa dívida em USD converte para a moeda da dívida", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        currency: "USD",
        amount: 100,
      }),
    );

    // R$ 108,00 ÷ 5,40 = US$ 20,00 → o restante cai para 80.
    await settleDebt(
      user.id,
      debt.id,
      debtSettlementInput({ accountId: account.id, amount: 108, currency: "BRL" }),
    );

    expect(await state(user.id, debt.id, account.id)).toMatchObject({
      restante: "80.00",
      status: "PARTIALLY_PAID",
    });
  });

  // Com o câmbio fora do ar, cada um dos dois pares tem a sua taxa.
  it("aplica cada taxa manual ao seu par de moedas", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        currency: "USD",
        amount: 100,
      }),
    );

    setFxAvailable(false);

    // Lançamento na moeda da própria conta: o saldo se move pelos R$ 108,00
    // lançados, não pelos US$ 20,00 que eles abatem.
    await settleDebt(
      user.id,
      debt.id,
      debtSettlementInput({
        accountId: account.id,
        amount: 108,
        currency: "BRL",
        manualDebtFxRate: 0.1852,
      }),
    );

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "100.00",
      restante: "80.00",
      status: "PARTIALLY_PAID",
      // 1000 − (100 × 5,40) + 108,00.
      saldo: "568.00",
      saldoRecalculado: "568.00",
    });
  });

  it("aceita três moedas distintas, uma taxa para cada conversão", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        currency: "USD",
        amount: 100,
      }),
    );

    setFxAvailable(false);

    // EUR 20,00 → BRL 125,00 na conta, e → USD 23,20 na dívida.
    await settleDebt(
      user.id,
      debt.id,
      debtSettlementInput({
        accountId: account.id,
        amount: 20,
        currency: "EUR",
        manualFxRate: 6.25,
        manualDebtFxRate: 1.16,
      }),
    );

    expect(await state(user.id, debt.id, account.id)).toEqual({
      total: "100.00",
      restante: "76.80",
      status: "PARTIALLY_PAID",
      saldo: "585.00",
      saldoRecalculado: "585.00",
    });
  });

  it("câmbio indisponível não cria nada", async () => {
    const { user, account, category, person } = await scenario();

    setFxAvailable(false);

    await expect(
      createDebt(
        user.id,
        debtInput({
          personId: person.id,
          categoryId: category.id,
          accountId: account.id,
          currency: "USD",
        }),
      ),
    ).rejects.toThrow();

    expect(await prisma.debt.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("posição por pessoa", () => {
  it("soma a receber e a pagar, e a posição líquida", async () => {
    const { user, account, category, person } = await scenario();
    const bob = await makePerson(user.id, { name: "Bob" });

    const lent = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        amount: 200,
      }),
    );
    await settleDebt(user.id, lent.id, debtSettlementInput({ accountId: account.id, amount: 80 }));

    await createDebt(
      user.id,
      debtInput({
        personId: bob.id,
        categoryId: category.id,
        accountId: account.id,
        type: "BORROWED",
        amount: 50,
      }),
    );

    const overview = await getPeopleOverview(user.id, "BRL");

    expect(
      overview.people.map((entry) => ({
        nome: entry.name,
        aReceber: entry.receivable,
        aPagar: entry.payable,
        liquido: entry.net,
        abertas: entry.openDebts,
      })),
    ).toEqual([
      { nome: "Alice", aReceber: 120, aPagar: 0, liquido: 120, abertas: 1 },
      { nome: "Bob", aReceber: 0, aPagar: 50, liquido: -50, abertas: 1 },
    ]);

    expect(overview.totalReceivable).toBe(120);
    expect(overview.totalPayable).toBe(50);
    expect(overview.totalNet).toBe(70);
    expect(overview.complete).toBe(true);
  });

  it("dívida quitada sai da posição", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 200 }));

    const overview = await getPeopleOverview(user.id, "BRL");

    expect(overview.people[0]).toMatchObject({ name: "Alice", net: 0, openDebts: 0 });
    expect(overview.totalNet).toBe(0);
  });

  it("converte a posição para a moeda base", async () => {
    const { user, account, category, person } = await scenario();

    await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        currency: "USD",
        amount: 100,
      }),
    );

    const overview = await getPeopleOverview(user.id, "BRL");

    expect(overview.totalReceivable).toBe(540);
    expect(overview.complete).toBe(true);
  });

  it("marca a posição como parcial quando falta cotação", async () => {
    const { user, account, category, person } = await scenario();

    await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        currency: "USD",
        amount: 100,
      }),
    );

    setRates({});

    const overview = await getPeopleOverview(user.id, "BRL");

    expect(overview.totalReceivable).toBe(0);
    expect(overview.complete).toBe(false);
    expect(overview.people[0]!.complete).toBe(false);
    // A dívida continua contada como em aberto, mesmo fora do total.
    expect(overview.people[0]!.openDebts).toBe(1);
  });

  // Em base USD, é a dívida em real que passa pela conversão.
  it("converte a posição para uma moeda base que não é BRL", async () => {
    const { user, account, category, person } = await scenario();

    await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        currency: "BRL",
        amount: 500,
      }),
    );

    const overview = await getPeopleOverview(user.id, "USD");

    // 500 × 0,1852 = 92,60
    expect(overview.totalReceivable).toBeCloseTo(92.6, 2);
    expect(overview.complete).toBe(true);
  });

  it("recusa remover pessoa com dívida em aberto", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await expect(deletePerson(user.id, person.id)).rejects.toThrow(InvalidOperationError);

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 200 }));

    // Quitada: a remoção passa, e o dinheiro movimentado fica no fluxo de caixa.
    await deletePerson(user.id, person.id);

    expect(await prisma.person.count({ where: { userId: user.id } })).toBe(0);
    await expectBalance(account.id, "1000.00");
  });
});

describe("histórico e isolamento", () => {
  it("lista as movimentações marcando a origem", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, debtSettlementInput({ accountId: account.id, amount: 80 }));

    const { debt: summary, movements } = await getDebtDetail(user.id, debt.id);

    expect(summary).toMatchObject({
      personName: "Alice",
      categoryName: "Viagem",
      originalAmount: 200,
      remainingAmount: 120,
      settledAmount: 80,
      settlementCount: 1,
    });

    expect(
      movements.map((movement) => ({
        data: movement.date.toISOString().slice(0, 10),
        origem: movement.isOrigin,
        valor: movement.convertedAmount,
      })),
    ).toEqual([
      { data: "2026-08-06", origem: true, valor: 200 },
      { data: "2026-08-16", origem: false, valor: 80 },
    ]);
  });

  it("ordena dívidas em aberto antes das quitadas", async () => {
    const { user, account, category, person } = await scenario();

    const paid = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        amount: 10,
        description: "Quitada",
      }),
    );
    await settleDebt(user.id, paid.id, debtSettlementInput({ accountId: account.id, amount: 10 }));

    await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        description: "Em aberto",
      }),
    );

    const debts = await listDebts(user.id);

    expect(debts.map((debt) => debt.description)).toEqual(["Em aberto", "Quitada"]);
  });

  it("dívida de outro usuário é inacessível", async () => {
    const { user, account, category, person } = await scenario();
    const intruder = await makeUser();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await expect(getDebtDetail(intruder.id, debt.id)).rejects.toThrow(NotFoundError);
    await expect(deleteDebt(intruder.id, debt.id)).rejects.toThrow(NotFoundError);
    await expect(
      settleDebt(intruder.id, debt.id, debtSettlementInput({ accountId: account.id })),
    ).rejects.toThrow(NotFoundError);
    expect(await listDebts(intruder.id)).toEqual([]);
  });

  it("recusa pessoa, categoria e conta de outro usuário", async () => {
    const { user, account, category } = await scenario();
    const other = await makeUser();
    const foreignPerson = await makePerson(other.id);
    const foreignCategory = await makeCategory(other.id);
    const foreignAccount = await makeAccount(other.id);
    const person = await makePerson(user.id);

    await expect(
      createDebt(
        user.id,
        debtInput({
          personId: foreignPerson.id,
          categoryId: category.id,
          accountId: account.id,
        }),
      ),
    ).rejects.toThrow(NotFoundError);

    await expect(
      createDebt(
        user.id,
        debtInput({
          personId: person.id,
          categoryId: foreignCategory.id,
          accountId: account.id,
        }),
      ),
    ).rejects.toThrow(NotFoundError);

    await expect(
      createDebt(
        user.id,
        debtInput({
          personId: person.id,
          categoryId: category.id,
          accountId: foreignAccount.id,
        }),
      ),
    ).rejects.toThrow(NotFoundError);
  });
});
