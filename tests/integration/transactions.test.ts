import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { FxUnavailableError } from "@/lib/fxService";
import { recomputeBalance } from "@/lib/accountBalance";
import { createDebt, settleDebt } from "@/lib/debts";
import { createCardPurchase } from "@/lib/cardPurchases";
import { listCardInvoices } from "@/lib/invoices";
import { payInvoice } from "@/lib/invoicePayments";
import {
  createTransaction,
  deleteTransaction,
  listMonthTransactions,
  listRecentTransactions,
  updateTransaction,
} from "@/lib/transactions";
import type { TransactionInput } from "@/lib/validations";
import { makeAccount, makeCategory, makeCreditCard, makePerson, makeUser } from "@tests/support/factories";
import { setFxAvailable, setRates } from "@tests/setup-fx";

/**
 * Fluxo de caixa em conta bancária.
 *
 * O que estes testes protegem, e que nenhum teste unitário alcança: o saldo
 * denormalizado bater com os lançamentos depois de criar, editar e apagar; a
 * conversão multi-moeda gravar a taxa e o valor certos; e o escopo por usuário
 * impedir acesso cruzado.
 */

function input(overrides: Partial<TransactionInput> & { accountId: string }): TransactionInput {
  return {
    categoryId: null,
    type: "EXPENSE",
    amount: 100,
    currency: "BRL",
    date: "2026-08-15",
    description: "Lançamento de teste",
    manualFxRate: null,
    ...overrides,
  };
}

/** Saldo atual da conta, como string com 2 casas. */
async function balanceOf(accountId: string): Promise<string> {
  const account = await prisma.financialAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { currentBalance: true },
  });

  return account.currentBalance.toFixed(2);
}

beforeEach(() => {
  setRates({ "USD->BRL": 5.4, "BRL->USD": 0.1852, "EUR->BRL": 6.25 });
});

describe("criação e saldo", () => {
  it("debita o valor exato numa despesa na moeda da conta", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });

    await createTransaction(user.id, input({ accountId: account.id, amount: 450.3 }));

    expect(await balanceOf(account.id)).toBe("549.70");
  });

  it("credita numa receita", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });

    await createTransaction(
      user.id,
      input({ accountId: account.id, type: "INCOME", amount: 8000 }),
    );

    expect(await balanceOf(account.id)).toBe("9000.00");
  });

  it("permite o saldo ficar negativo", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "100.00" });

    await createTransaction(user.id, input({ accountId: account.id, amount: 250 }));

    expect(await balanceOf(account.id)).toBe("-150.00");
  });

  it("não acumula erro de arredondamento em muitos lançamentos", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "0.00" });

    for (let index = 0; index < 30; index += 1) {
      await createTransaction(
        user.id,
        input({ accountId: account.id, type: "INCOME", amount: 0.01 }),
      );
    }

    expect(await balanceOf(account.id)).toBe("0.30");
  });

  it("marca o lançamento como CONFIRMED", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);

    const created = await createTransaction(user.id, input({ accountId: account.id }));

    expect(created.status).toBe("CONFIRMED");
  });
});

describe("conversão multi-moeda", () => {
  it("grava taxa e valor convertido na moeda da conta", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, {
      currency: "BRL",
      initialBalance: "1000.00",
    });

    const created = await createTransaction(
      user.id,
      input({ accountId: account.id, amount: 15, currency: "USD" }),
    );

    expect(created.amount.toFixed(2)).toBe("15.00");
    expect(created.currency).toBe("USD");
    expect(created.exchangeRate.toFixed(4)).toBe("5.4000");
    expect(created.convertedAmount.toFixed(2)).toBe("81.00");

    // É o convertedAmount que move o saldo, não o amount.
    expect(await balanceOf(account.id)).toBe("919.00");
  });

  it("usa taxa 1 quando a moeda do lançamento é a da conta", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { currency: "USD" });

    const created = await createTransaction(
      user.id,
      input({ accountId: account.id, amount: 25, currency: "USD" }),
    );

    expect(created.exchangeRate.toFixed(4)).toBe("1.0000");
    expect(created.convertedAmount.toFixed(2)).toBe("25.00");
  });

  it("respeita a taxa manual informada pelo usuário", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { currency: "BRL", initialBalance: "0.00" });

    const created = await createTransaction(
      user.id,
      input({ accountId: account.id, amount: 10, currency: "USD", manualFxRate: 6 }),
    );

    expect(created.exchangeRate.toFixed(4)).toBe("6.0000");
    expect(await balanceOf(account.id)).toBe("-60.00");
  });

  it("falha sem criar nada quando o câmbio está indisponível", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { currency: "BRL", initialBalance: "1000.00" });
    setFxAvailable(false);

    await expect(
      createTransaction(user.id, input({ accountId: account.id, currency: "USD" })),
    ).rejects.toThrow(FxUnavailableError);

    // Nem transação, nem alteração de saldo.
    await expect(prisma.transaction.count()).resolves.toBe(0);
    expect(await balanceOf(account.id)).toBe("1000.00");
  });

  it("não consulta o câmbio quando há taxa manual, mesmo com a API fora", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { currency: "BRL", initialBalance: "0.00" });
    setFxAvailable(false);

    const created = await createTransaction(
      user.id,
      input({ accountId: account.id, amount: 10, currency: "USD", manualFxRate: 5 }),
    );

    expect(created.convertedAmount.toFixed(2)).toBe("50.00");
  });
});

describe("edição", () => {
  it("ajusta o saldo pelo novo valor, sem re-somar o antigo", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });

    const created = await createTransaction(
      user.id,
      input({ accountId: account.id, amount: 100 }),
    );
    expect(await balanceOf(account.id)).toBe("900.00");

    await updateTransaction(
      user.id,
      created.id,
      input({ accountId: account.id, amount: 250 }),
    );

    expect(await balanceOf(account.id)).toBe("750.00");
  });

  it("inverte o efeito ao trocar despesa por receita", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });

    const created = await createTransaction(
      user.id,
      input({ accountId: account.id, amount: 100 }),
    );

    await updateTransaction(
      user.id,
      created.id,
      input({ accountId: account.id, amount: 100, type: "INCOME" }),
    );

    expect(await balanceOf(account.id)).toBe("1100.00");
  });

  it("move o efeito entre contas ao trocar a conta", async () => {
    const user = await makeUser();
    const origin = await makeAccount(user.id, { initialBalance: "1000.00" });
    const target = await makeAccount(user.id, { initialBalance: "500.00" });

    const created = await createTransaction(
      user.id,
      input({ accountId: origin.id, amount: 100 }),
    );

    await updateTransaction(user.id, created.id, input({ accountId: target.id, amount: 100 }));

    expect(await balanceOf(origin.id)).toBe("1000.00");
    expect(await balanceOf(target.id)).toBe("400.00");
  });

  it("recalcula a conversão ao trocar a moeda do lançamento", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { currency: "BRL", initialBalance: "1000.00" });

    const created = await createTransaction(
      user.id,
      input({ accountId: account.id, amount: 10, currency: "BRL" }),
    );

    const updated = await updateTransaction(
      user.id,
      created.id,
      input({ accountId: account.id, amount: 10, currency: "USD" }),
    );

    expect(updated.exchangeRate.toFixed(4)).toBe("5.4000");
    expect(updated.convertedAmount.toFixed(2)).toBe("54.00");
    expect(await balanceOf(account.id)).toBe("946.00");
  });
});

describe("exclusão", () => {
  it("reverte o saldo ao valor anterior", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });

    const created = await createTransaction(
      user.id,
      input({ accountId: account.id, amount: 137.45 }),
    );

    await deleteTransaction(user.id, created.id);

    expect(await balanceOf(account.id)).toBe("1000.00");
    await expect(prisma.transaction.count()).resolves.toBe(0);
  });
});

describe("consistência do saldo denormalizado", () => {
  it("bate com o recálculo após uma sequência de operações", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });

    const first = await createTransaction(
      user.id,
      input({ accountId: account.id, type: "INCOME", amount: 8000 }),
    );
    const second = await createTransaction(
      user.id,
      input({ accountId: account.id, amount: 450.3 }),
    );
    await createTransaction(
      user.id,
      input({ accountId: account.id, amount: 15, currency: "USD" }),
    );

    await updateTransaction(
      user.id,
      second.id,
      input({ accountId: account.id, amount: 500 }),
    );
    await deleteTransaction(user.id, first.id);

    const stored = await balanceOf(account.id);
    const recomputed = await recomputeBalance(account.id);

    expect(stored).toBe(recomputed.toFixed(2));
    // 1000 − 500 − 81 = 419
    expect(stored).toBe("419.00");
  });
});

describe("isolamento entre usuários", () => {
  it("recusa criar em conta de outro usuário", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const account = await makeAccount(owner.id);

    await expect(
      createTransaction(intruder.id, input({ accountId: account.id })),
    ).rejects.toThrow(NotFoundError);
  });

  it("recusa categoria de outro usuário", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const account = await makeAccount(owner.id);
    const foreignCategory = await makeCategory(other.id);

    await expect(
      createTransaction(
        owner.id,
        input({ accountId: account.id, categoryId: foreignCategory.id }),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("recusa editar e apagar transação de outro usuário, sem alterar o saldo", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const account = await makeAccount(owner.id, { initialBalance: "1000.00" });
    const created = await createTransaction(
      owner.id,
      input({ accountId: account.id, amount: 100 }),
    );

    await expect(
      updateTransaction(intruder.id, created.id, input({ accountId: account.id, amount: 1 })),
    ).rejects.toThrow(NotFoundError);
    await expect(deleteTransaction(intruder.id, created.id)).rejects.toThrow(NotFoundError);

    expect(await balanceOf(account.id)).toBe("900.00");
  });

  it("não lista transações de outro usuário", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const ownerAccount = await makeAccount(owner.id);
    const otherAccount = await makeAccount(other.id);

    await createTransaction(owner.id, input({ accountId: ownerAccount.id }));
    await createTransaction(other.id, input({ accountId: otherAccount.id }));

    const listed = await listMonthTransactions(owner.id, 2026, 8);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.accountId).toBe(ownerAccount.id);
  });
});

describe("listagem por competência", () => {
  it("inclui as bordas do mês e exclui os vizinhos", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);

    for (const date of ["2026-07-31", "2026-08-01", "2026-08-31", "2026-09-01"]) {
      await createTransaction(user.id, input({ accountId: account.id, date, description: date }));
    }

    const listed = await listMonthTransactions(user.id, 2026, 8);

    expect(listed.map((item) => item.description).sort()).toEqual(["2026-08-01", "2026-08-31"]);
  });

  it("traz nome e moeda da conta e da categoria", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { name: "Nubank", currency: "BRL" });
    const category = await makeCategory(user.id, { name: "Mercado", color: "#40c057" });

    await createTransaction(
      user.id,
      input({ accountId: account.id, categoryId: category.id }),
    );

    const [item] = await listMonthTransactions(user.id, 2026, 8);

    expect(item).toMatchObject({
      accountName: "Nubank",
      accountCurrency: "BRL",
      categoryName: "Mercado",
      categoryColor: "#40c057",
    });
  });
});

/**
 * Amortização e pagamento de fatura são metade de uma escrita de dois lados:
 * mexer neles daqui deixaria `Debt.remainingAmount` ou a fatura no valor de
 * antes. Toda recusa afirma também que nada mudou.
 */
describe("lançamentos que pertencem a outro serviço", () => {
  it("recusa editar e apagar uma amortização, e não move nada", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);

    const debt = await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      accountId: account.id,
      type: "LENT",
      description: "Empréstimo",
      amount: 200,
      currency: "BRL",
      date: "2026-08-06",
      dueDate: null,
      manualFxRate: null,
    });

    const settlement = await settleDebt(user.id, debt.id, {
      accountId: account.id,
      amount: 80,
      currency: "BRL",
      date: "2026-08-16",
      categoryId: null,
      description: null,
      manualFxRate: null,
    });

    const before = await balanceOf(account.id);

    await expect(
      updateTransaction(user.id, settlement.id, input({ accountId: account.id, amount: 5 })),
    ).rejects.toThrow(InvalidOperationError);
    await expect(deleteTransaction(user.id, settlement.id)).rejects.toThrow(InvalidOperationError);

    expect(await balanceOf(account.id)).toBe(before);
    expect(await prisma.transaction.count({ where: { id: settlement.id } })).toBe(1);

    const after = await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } });
    expect(after.remainingAmount.toFixed(2)).toBe("120.00");
    expect(after.status).toBe("PARTIALLY_PAID");
  });

  it("recusa editar e apagar um pagamento de fatura, e não move nada", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createCardPurchase(user.id, {
      creditCardId: card.id,
      categoryId: null,
      description: "Compra",
      amount: 250,
      currency: "BRL",
      date: "2026-08-15",
      installments: 1,
      manualFxRate: null,
    });

    const [invoice] = await listCardInvoices(user.id, card.id);
    const payment = await payInvoice(user.id, invoice!.id, {
      accountId: account.id,
      date: "2026-09-05",
      manualFxRate: null,
    });

    const before = await balanceOf(account.id);

    await expect(
      updateTransaction(user.id, payment.id, input({ accountId: account.id, amount: 5 })),
    ).rejects.toThrow(InvalidOperationError);
    await expect(deleteTransaction(user.id, payment.id)).rejects.toThrow(InvalidOperationError);

    expect(await balanceOf(account.id)).toBe(before);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } });
    expect(after.status).toBe("PAID");
    expect(after.totalAmount.toFixed(2)).toBe("250.00");
    expect(after.paymentAccountId).toBe(account.id);
  });

  it("lista os dois, marcados pelo serviço que os governa", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });

    await createTransaction(user.id, input({ accountId: account.id, description: "Mercado" }));

    await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      accountId: account.id,
      type: "LENT",
      description: "Empréstimo",
      amount: 200,
      currency: "BRL",
      date: "2026-08-06",
      dueDate: null,
      manualFxRate: null,
    });

    await createCardPurchase(user.id, {
      creditCardId: card.id,
      categoryId: null,
      description: "Compra",
      amount: 250,
      currency: "BRL",
      date: "2026-08-15",
      installments: 1,
      manualFxRate: null,
    });

    const [invoice] = await listCardInvoices(user.id, card.id);
    await payInvoice(user.id, invoice!.id, {
      accountId: account.id,
      date: "2026-08-25",
      manualFxRate: null,
    });

    // Os três aparecem; o que muda é quem pode editá-los.
    for (const listed of [
      await listMonthTransactions(user.id, 2026, 8),
      await listRecentTransactions(user.id),
    ]) {
      expect(listed).toHaveLength(3);
      expect(listed.map((item) => item.managedBy).sort()).toEqual(["debt", "invoice", null]);
      expect(listed.find((item) => item.description === "Mercado")?.managedBy).toBeNull();
    }
  });
});
