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
import { getPeopleOverview, deletePerson } from "@/lib/people";
import type { DebtInput, DebtSettlementInput } from "@/lib/validations";
import { makeAccount, makeCategory, makePerson, makeUser } from "../factories";
import { setFxAvailable, setRates } from "../setup-fx";

/**
 * Empréstimos e dívidas pessoais.
 *
 * O que estes testes protegem: as duas pontas andarem sempre juntas — saldo da
 * conta e `remainingAmount` — e o `status` ser derivado, nunca inventado. A
 * única forma de verificar isso é conferindo os dois lados depois de cada
 * operação.
 */

function debtInput(
  overrides: Partial<DebtInput> & { personId: string; categoryId: string; accountId: string },
): DebtInput {
  return {
    type: "LENT",
    description: "Empréstimo de teste",
    amount: 200,
    currency: "BRL",
    date: "2026-08-06",
    dueDate: null,
    manualFxRate: null,
    ...overrides,
  };
}

function settlementInput(
  overrides: Partial<DebtSettlementInput> & { accountId: string },
): DebtSettlementInput {
  return {
    amount: 80,
    currency: "BRL",
    date: "2026-08-16",
    categoryId: null,
    description: null,
    manualFxRate: null,
    ...overrides,
  };
}

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

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 80 }));

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

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 80 }));
    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 120 }));

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

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id }));

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
      settlementInput({ accountId: account.id, categoryId: other.id }),
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

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 100 }));

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

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 80 }));

    await expect(
      settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 120.01 })),
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

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 200 }));

    await expect(
      settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 1 })),
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

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 0.01 }));
    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 0.02 }));

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
      settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 200 })),
      settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 200 })),
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
      settlementInput({ accountId: account.id, amount: 80 }),
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
      settlementInput({ accountId: account.id, amount: 80 }),
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
    expect((await recomputeBalance(account.id)).toFixed(2)).toBe("800.00");
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

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 80 }));
    await deleteDebt(user.id, debt.id);

    expect(await prisma.debt.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(0);

    const stored = await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });

    expect(stored.currentBalance.toFixed(2)).toBe("1000.00");
  });
});

describe("edição da dívida", () => {
  it("aumentar o total ajusta a origem, o restante e o saldo", async () => {
    const { user, account, category, person } = await scenario();

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

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 150 }));

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

    expect((await recomputeBalance(account.id)).toFixed(2)).toBe("1000.00");
    expect((await recomputeBalance(other.id)).toFixed(2)).toBe("300.00");

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
      settlementInput({ accountId: account.id, amount: 40, currency: "USD" }),
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
      settlementInput({ accountId: account.id, amount: 108, currency: "BRL" }),
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
      settlementInput({
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
      settlementInput({
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
    await settleDebt(user.id, lent.id, settlementInput({ accountId: account.id, amount: 80 }));

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

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 200 }));

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

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 200 }));

    // Quitada: a remoção passa, e o dinheiro movimentado fica no fluxo de caixa.
    await deletePerson(user.id, person.id);

    expect(await prisma.person.count({ where: { userId: user.id } })).toBe(0);
    expect((await recomputeBalance(account.id)).toFixed(2)).toBe("1000.00");
  });
});

describe("histórico e isolamento", () => {
  it("lista as movimentações marcando a origem", async () => {
    const { user, account, category, person } = await scenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 80 }));

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
    await settleDebt(user.id, paid.id, settlementInput({ accountId: account.id, amount: 10 }));

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
      settleDebt(intruder.id, debt.id, settlementInput({ accountId: account.id })),
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
