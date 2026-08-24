import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import {
  createAccount,
  deleteAccount,
  getAccountBalances,
  listAccounts,
  updateAccount,
} from "@/lib/accounts";
import { reconcileBalance } from "@/lib/accountBalance";
import { createTransaction } from "@/lib/transactions";
import { accountSchema } from "@/lib/validations";
import { makeAccount, makeCreditCard, makeUser } from "../factories";
import { setFxAvailable, setRates } from "../setup-fx";

beforeEach(() => {
  setFxAvailable(true);
  setRates({ "USD->BRL": 5.4, "EUR->BRL": 6.25, "BRL->USD": 0.1852 });
});

type AccountInput = Parameters<typeof createAccount>[1];

function accountInput(overrides: Partial<AccountInput> = {}): AccountInput {
  return {
    name: "Conta",
    type: "CHECKING",
    institution: null,
    currency: "BRL",
    initialBalance: 0,
    ...overrides,
  };
}

describe("criação", () => {
  it("faz o saldo atual partir do saldo inicial", async () => {
    const user = await makeUser();

    const account = await createAccount(
      user.id,
      accountInput({ name: "Nubank", initialBalance: 1000 }),
    );

    expect(account.initialBalance.toFixed(2)).toBe("1000.00");
    expect(account.currentBalance.toFixed(2)).toBe("1000.00");
  });

  it("aceita saldo inicial zero e negativo", async () => {
    const user = await makeUser();

    const zero = await createAccount(user.id, accountInput({ name: "Carteira" }));
    const negative = await createAccount(
      user.id,
      accountInput({ name: "Cheque especial", initialBalance: -250.5 }),
    );

    expect(zero.currentBalance.toFixed(2)).toBe("0.00");
    expect(negative.currentBalance.toFixed(2)).toBe("-250.50");
  });
});

describe("edição", () => {
  it("desloca o saldo atual preservando o efeito dos lançamentos", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });

    await createTransaction(user.id, {
      accountId: account.id,
      categoryId: null,
      type: "EXPENSE",
      amount: 200,
      currency: "BRL",
      date: "2026-08-10",
      description: "Compra",
      manualFxRate: null,
    });
    // 1000 − 200 = 800

    const updated = await updateAccount(
      user.id,
      account.id,
      accountInput({ name: "Nubank renomeado", initialBalance: 1500 }),
    );

    // O saldo inicial subiu 500, então o atual sobe 500: 800 + 500 = 1300.
    expect(updated.currentBalance.toFixed(2)).toBe("1300.00");
    expect(updated.name).toBe("Nubank renomeado");

    const { drifted } = await reconcileBalance(account.id);
    expect(drifted).toBe(false);
  });

  it("não altera o saldo atual quando o inicial não muda", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });

    const updated = await updateAccount(
      user.id,
      account.id,
      accountInput({ name: "Outro nome", initialBalance: 1000 }),
    );

    expect(updated.currentBalance.toFixed(2)).toBe("1000.00");
  });

  it("ignora tentativa de trocar a moeda", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { currency: "BRL", initialBalance: "100.00" });

    const updated = await updateAccount(
      user.id,
      account.id,
      accountInput({ name: account.name, currency: "USD", initialBalance: 100 }),
    );

    // Trocar a moeda reinterpretaria todo o histórico de convertedAmount.
    expect(updated.currency).toBe("BRL");
  });

  it("recusa conta de outro usuário", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const account = await makeAccount(owner.id);

    await expect(
      updateAccount(intruder.id, account.id, accountInput({ name: "Invadida" })),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("exclusão", () => {
  it("remove a conta e seus lançamentos em cascata", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    await createTransaction(user.id, {
      accountId: account.id,
      categoryId: null,
      type: "EXPENSE",
      amount: 50,
      currency: "BRL",
      date: "2026-08-10",
      description: "Compra",
      manualFxRate: null,
    });

    await deleteAccount(user.id, account.id);

    await expect(prisma.financialAccount.count()).resolves.toBe(0);
    await expect(prisma.transaction.count()).resolves.toBe(0);
  });

  it("recusa conta de outro usuário", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const account = await makeAccount(owner.id);

    await expect(deleteAccount(intruder.id, account.id)).rejects.toThrow(NotFoundError);
    await expect(prisma.financialAccount.count()).resolves.toBe(1);
  });
});

describe("listagem", () => {
  it("traz apenas as contas do usuário, em ordem alfabética", async () => {
    const user = await makeUser();
    const other = await makeUser();
    await makeAccount(user.id, { name: "Zebra" });
    await makeAccount(user.id, { name: "Alfa" });
    await makeAccount(other.id, { name: "De outro" });

    const listed = await listAccounts(user.id);

    expect(listed.map((account) => account.name)).toEqual(["Alfa", "Zebra"]);
  });
});

describe("patrimônio líquido com câmbio", () => {
  it("converte contas estrangeiras para a moeda base", async () => {
    const user = await makeUser({ baseCurrency: "BRL" });
    await makeAccount(user.id, { currency: "BRL", initialBalance: "1000.00" });
    await makeAccount(user.id, { currency: "USD", initialBalance: "100.00" });

    const result = await getAccountBalances(user.id, "BRL");

    // 1000 + (100 × 5,40) = 1540
    expect(result.netWorth).toBeCloseTo(1540, 2);
    expect(result.netWorthComplete).toBe(true);
    expect(result.accounts).toHaveLength(2);
  });

  it("exclui do total a conta sem cotação e sinaliza total parcial", async () => {
    const user = await makeUser({ baseCurrency: "BRL" });
    await makeAccount(user.id, { currency: "BRL", initialBalance: "1000.00" });
    await makeAccount(user.id, { currency: "GBP", initialBalance: "100.00" });

    const result = await getAccountBalances(user.id, "BRL");

    // GBP não tem cotação configurada: melhor um total honestamente parcial
    // que um total errado somando moedas diferentes.
    expect(result.netWorth).toBeCloseTo(1000, 2);
    expect(result.netWorthComplete).toBe(false);

    const gbp = result.accounts.find((account) => account.currency === "GBP");
    expect(gbp?.converted).toBe(false);
    expect(gbp?.balance).toBeCloseTo(100, 2);
  });

  it("marca o total como parcial quando a API de câmbio está fora", async () => {
    const user = await makeUser({ baseCurrency: "BRL" });
    await makeAccount(user.id, { currency: "USD", initialBalance: "100.00" });
    setFxAvailable(false);

    const result = await getAccountBalances(user.id, "BRL");

    expect(result.netWorthComplete).toBe(false);
    expect(result.netWorth).toBeCloseTo(0, 2);
  });

  it("devolve zero e total completo sem nenhuma conta", async () => {
    const user = await makeUser();

    const result = await getAccountBalances(user.id, "BRL");

    expect(result.accounts).toEqual([]);
    expect(result.netWorth).toBe(0);
    expect(result.netWorthComplete).toBe(true);
  });

  // Com base não-BRL, é a conta em **real** que precisa de cotação.
  it("converte para uma moeda base que não é BRL", async () => {
    const user = await makeUser({ baseCurrency: "USD" });
    await makeAccount(user.id, { currency: "BRL", initialBalance: "1000.00" });
    await makeAccount(user.id, { currency: "USD", initialBalance: "100.00" });

    const result = await getAccountBalances(user.id, "USD");

    // (1000 × 0,1852) + 100 = 285,20
    expect(result.netWorth).toBeCloseTo(285.2, 2);
    expect(result.netWorthComplete).toBe(true);

    const brl = result.accounts.find((account) => account.currency === "BRL");
    // O saldo nativo continua em real; só a conversão olha para a base.
    expect(brl?.balance).toBeCloseTo(1000, 2);
    expect(brl?.convertedBalance).toBeCloseTo(185.2, 2);
  });

  it("exclui a conta em BRL do patrimônio quando falta cotação para a base", async () => {
    const user = await makeUser({ baseCurrency: "USD" });
    await makeAccount(user.id, { currency: "BRL", initialBalance: "1000.00" });
    await makeAccount(user.id, { currency: "USD", initialBalance: "100.00" });
    // Sem `BRL->USD`: a conta em real é a que fica de fora agora.
    setRates({ "USD->BRL": 5.4 });

    const result = await getAccountBalances(user.id, "USD");

    expect(result.netWorth).toBeCloseTo(100, 2);
    expect(result.netWorthComplete).toBe(false);
    expect(result.accounts.find((account) => account.currency === "BRL")?.converted).toBe(
      false,
    );
  });
});

describe("reconciliação", () => {
  it("detecta e corrige saldo dessincronizado", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });

    // Corrompe o saldo de propósito, simulando uma escrita que escapou do serviço.
    await prisma.financialAccount.update({
      where: { id: account.id },
      data: { currentBalance: "777.77" },
    });

    const result = await reconcileBalance(account.id);

    expect(result.drifted).toBe(true);
    expect(result.stored.toFixed(2)).toBe("777.77");
    expect(result.expected.toFixed(2)).toBe("1000.00");

    const after = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { currentBalance: true },
    });
    expect(after.currentBalance.toFixed(2)).toBe("1000.00");
  });

  it("não reporta divergência quando o saldo está correto", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "500.00" });

    await expect(reconcileBalance(account.id)).resolves.toMatchObject({ drifted: false });
  });
});

describe("tipo e instituição (multi-banco)", () => {
  it("grava tipo e instituição", async () => {
    const user = await makeUser();

    const account = await createAccount(
      user.id,
      accountInput({ name: "Poupança Inter", type: "SAVINGS", institution: "Inter" }),
    );

    expect(account.type).toBe("SAVINGS");
    expect(account.institution).toBe("Inter");
  });

  it("usa conta corrente como tipo padrão", async () => {
    const user = await makeUser();

    const account = await createAccount(user.id, accountInput());

    expect(account.type).toBe("CHECKING");
  });

  it("normaliza instituição em branco para nulo", async () => {
    const user = await makeUser();

    // O schema Zod faz o trim; o CHECK do banco recusaria string vazia.
    const parsed = accountSchema.parse({
      name: "Carteira",
      type: "CASH",
      institution: "   ",
      currency: "BRL",
      initialBalance: 0,
    });
    expect(parsed.institution).toBeNull();

    const account = await createAccount(user.id, parsed);
    expect(account.institution).toBeNull();
  });

  it("recusa instituição em branco vinda direto do banco", async () => {
    const user = await makeUser();

    await expect(
      prisma.financialAccount.create({
        data: { userId: user.id, name: "Ruim", institution: "  ", currency: "BRL" },
      }),
    ).rejects.toThrow(/financial_accounts_institution_check/);
  });

  it("permite conta e cartão da mesma instituição, agrupáveis", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { name: "Nubank CC", institution: "Nubank" });
    const card = await makeCreditCard(user.id, {
      name: "Cartão Nubank",
      institution: "Nubank",
      defaultPaymentAccountId: account.id,
      creditLimit: "5000.00",
    });

    expect(card.institution).toBe(account.institution);
    expect(card.defaultPaymentAccountId).toBe(account.id);
    expect(card.creditLimit?.toFixed(2)).toBe("5000.00");
  });

  it("recusa limite de crédito zero ou negativo", async () => {
    const user = await makeUser();

    await expect(
      makeCreditCard(user.id, { creditLimit: "0.00" }),
    ).rejects.toThrow(/credit_cards_credit_limit_check/);
    await expect(
      makeCreditCard(user.id, { creditLimit: "-100.00" }),
    ).rejects.toThrow(/credit_cards_credit_limit_check/);
  });

  it("desvincula a conta de pagamento padrão ao apagar a conta, sem apagar o cartão", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const card = await makeCreditCard(user.id, { defaultPaymentAccountId: account.id });

    await deleteAccount(user.id, account.id);

    const after = await prisma.creditCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.defaultPaymentAccountId).toBeNull();
  });
});
