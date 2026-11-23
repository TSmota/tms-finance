import { cache } from "react";
import type { AccountType, Currency, FinancialAccount } from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { resolveRatesToBase } from "@/lib/fxService";
import { money, toStorage } from "@/lib/money";
import { byName } from "@/lib/sorting";
import { monthRange } from "@/lib/dates";
import type { AccountInput } from "@/lib/validations";

/**
 * Contas bancárias e carteiras.
 *
 * O saldo não é somado a cada leitura: vem de `current_balance`, mantido por
 * `@/lib/accountBalance` em toda escrita de transação.
 */

export async function createAccount(
  userId: string,
  input: AccountInput,
): Promise<FinancialAccount> {
  const initialBalance = toStorage(input.initialBalance);

  return prisma.financialAccount.create({
    data: {
      userId,
      name: input.name,
      type: input.type,
      institution: input.institution,
      currency: input.currency,
      initialBalance,
      // Conta nova não tem lançamentos: o saldo atual é o inicial.
      currentBalance: initialBalance,
    },
  });
}

/**
 * Atualiza a conta. Mexer no saldo inicial desloca o saldo atual pela mesma
 * diferença, preservando o efeito dos lançamentos já registrados.
 *
 * A moeda é deliberadamente imutável: trocá-la reinterpretaria todo o histórico
 * de `convertedAmount` — R$ 100 viraria US$ 100 sem nenhuma conversão.
 */
export async function updateAccount(
  userId: string,
  id: string,
  input: AccountInput,
): Promise<FinancialAccount> {
  const existing = await prisma.financialAccount.findFirst({
    where: { id, userId },
    select: { initialBalance: true },
  });

  if (!existing) {
    throw new NotFoundError("Conta não encontrada");
  }

  const nextInitial = money(input.initialBalance);
  const shift = nextInitial.minus(existing.initialBalance);

  return prisma.financialAccount.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      institution: input.institution,
      initialBalance: toStorage(nextInitial),
      currentBalance: shift.isZero() ? undefined : { increment: toStorage(shift) },
    },
  });
}

/**
 * Motivo pelo qual a conta não pode ser removida, ou `null`. Fonte única:
 * {@link deleteAccount} recusa por aqui e `@/lib/deletionImpact` consulta.
 *
 * Fatura paga: `paymentAccountId` é `SetNull`, mas o CHECK
 * `invoices_paid_consistency_check` a exige — sem a guarda, erro cru do
 * Postgres. Movimentação de dívida: o lançamento cascateia e
 * `Debt.remainingAmount` fica no valor de antes.
 */
export async function accountDeletionBlocker(
  userId: string,
  id: string,
): Promise<string | null> {
  const [paidInvoices, debtMovements, transfers] = await Promise.all([
    prisma.invoice.count({ where: { userId, paymentAccountId: id, status: "PAID" } }),
    prisma.transaction.count({ where: { userId, accountId: id, debtId: { not: null } } }),
    prisma.transfer.count({ where: { userId, OR: [{ sourceAccountId: id }, { destinationAccountId: id }] } }),
  ]);

  if (transfers > 0) {
    return "Esta conta tem transferências. Remova as transferências antes de remover a conta.";
  }

  if (paidInvoices > 0) {
    return (
      `Esta conta pagou ${paidInvoices} fatura(s) de cartão e não pode ser removida: ` +
      "o histórico de pagamento exige a conta de origem. Desfaça os pagamentos antes."
    );
  }

  if (debtMovements > 0) {
    return (
      `Esta conta tem ${debtMovements} movimentação(ões) de empréstimo e não pode ser ` +
      "removida: o saldo restante das dívidas ficaria sem o lançamento que o justifica. " +
      "Remova as dívidas antes."
    );
  }

  return null;
}

export async function deleteAccount(userId: string, id: string): Promise<void> {
  const account = await prisma.financialAccount.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!account) {
    throw new NotFoundError("Conta não encontrada");
  }

  const blocker = await accountDeletionBlocker(userId, id);

  if (blocker) {
    throw new InvalidOperationError(blocker);
  }

  await prisma.financialAccount.delete({ where: { id } });
}

/**
 * Contas do usuário, para popular `Select`s.
 *
 * A ordenação é feita na aplicação, não em `ORDER BY`: ver `@/lib/sorting`.
 *
 * `cache()` por requisição: o painel lê esta lista por três caminhos distintos
 * numa única renderização.
 */
export const listAccounts = cache(async function listAccounts(
  userId: string,
): Promise<FinancialAccount[]> {
  const accounts = await prisma.financialAccount.findMany({ where: { userId } });

  return accounts.sort(byName);
});

export interface AccountBalance {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: Currency;
  /** Saldo na moeda nativa da conta. */
  balance: number;
  /** Saldo convertido para a moeda base do usuário. */
  convertedBalance: number;
  /** Falso quando a taxa para a moeda base não pôde ser resolvida. */
  converted: boolean;
}

/**
 * Saldos das contas com conversão para a moeda base.
 *
 * Tolerante a falha de câmbio: conta sem cotação entra na lista com
 * `converted: false` e fica fora do patrimônio, que é sinalizado como
 * incompleto. Melhor um total parcial e honesto que um total errado.
 */
export async function getAccountBalances(
  userId: string,
  baseCurrency: Currency,
): Promise<{ accounts: AccountBalance[]; netWorth: number; netWorthComplete: boolean }> {
  const accounts = await prisma.financialAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  // Sem data: saldo é pergunta sobre o presente, então vale a cotação mais recente.
  const { rates } = await resolveRatesToBase(
    accounts.map((account) => account.currency),
    baseCurrency,
  );

  let netWorth = money(0);
  let netWorthComplete = true;

  const result = accounts.map((account) => {
    const balance = money(account.currentBalance);
    const rate = rates.get(account.currency);
    const converted = rate !== undefined;
    const convertedBalance = converted ? balance.times(rate) : balance;

    if (converted) {
      netWorth = netWorth.plus(convertedBalance);
    } else {
      netWorthComplete = false;
    }

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      institution: account.institution,
      currency: account.currency,
      balance: balance.toNumber(),
      convertedBalance: convertedBalance.toNumber(),
      converted,
    };
  });

  return { accounts: result, netWorth: netWorth.toNumber(), netWorthComplete };
}

export interface AccountStatementItem {
  id: string;
  date: Date;
  description: string;
  amount: number;
  currency: Currency;
  type: "INCOME" | "EXPENSE";
  kind: "TRANSACTION" | "TRANSFER_OUT" | "TRANSFER_IN";
  categoryName?: string | null;
  categoryColor?: string | null;
  counterpartAccountName?: string | null;
  creditCardName?: string | null;
  debtDescription?: string | null;
}

export interface AccountDetail {
  account: {
    id: string;
    name: string;
    type: AccountType;
    institution: string | null;
    currency: Currency;
    initialBalance: number;
    currentBalance: number;
    convertedBalance: number | null;
  };
  monthSummary: {
    totalIncome: number;
    totalExpense: number;
    net: number;
  };
  statement: AccountStatementItem[];
  linkedCreditCards: Array<{
    id: string;
    name: string;
    institution: string | null;
    creditLimit: number | null;
    currency: Currency;
    closingDay: number;
    dueDay: number;
  }>;
  linkedRecurringExpenses: Array<{
    id: string;
    description: string;
    amount: number;
    currency: Currency;
    frequency: string;
  }>;
}

/**
 * Detalhes de uma conta financeira específica em um determinado mês/ano.
 * Retorna metadados da conta, resumo financeiro da competência, extrato
 * cronológico unificado (transações e transferências) e vínculos ativos.
 */
export async function getAccountDetail(
  userId: string,
  id: string,
  year: number,
  month: number,
  baseCurrency: Currency,
): Promise<AccountDetail> {
  const account = await prisma.financialAccount.findFirst({
    where: { id, userId },
  });

  if (!account) {
    throw new NotFoundError("Conta não encontrada");
  }

  const { start, end } = monthRange(year, month);

  const [ratesResult, transactions, outgoingTransfers, incomingTransfers, linkedCards, linkedRecurring] =
    await Promise.all([
      resolveRatesToBase([account.currency], baseCurrency),
      prisma.transaction.findMany({
        where: {
          userId,
          accountId: id,
          date: { gte: start, lt: end },
        },
        include: {
          category: { select: { name: true, color: true } },
          creditCard: { select: { name: true } },
          debt: { select: { description: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      prisma.transfer.findMany({
        where: {
          userId,
          sourceAccountId: id,
          date: { gte: start, lt: end },
        },
        include: {
          destinationAccount: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      prisma.transfer.findMany({
        where: {
          userId,
          destinationAccountId: id,
          date: { gte: start, lt: end },
        },
        include: {
          sourceAccount: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      prisma.creditCard.findMany({
        where: { userId, defaultPaymentAccountId: id },
        select: {
          id: true,
          name: true,
          institution: true,
          currency: true,
          creditLimit: true,
          closingDay: true,
          dueDay: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.recurringExpense.findMany({
        where: { userId, accountId: id, active: true },
        select: {
          id: true,
          description: true,
          amount: true,
          currency: true,
          frequency: true,
        },
        orderBy: { description: "asc" },
      }),
    ]);

  const rate = ratesResult.rates.get(account.currency);
  const convertedBalance =
    rate !== undefined ? money(account.currentBalance).times(rate).toNumber() : null;

  const statement: AccountStatementItem[] = [];

  for (const tx of transactions) {
    statement.push({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: Number(tx.convertedAmount),
      currency: account.currency,
      type: tx.type === "INCOME" ? "INCOME" : "EXPENSE",
      kind: "TRANSACTION",
      categoryName: tx.category?.name,
      categoryColor: tx.category?.color,
      creditCardName: tx.creditCard?.name,
      debtDescription: tx.debt?.description,
    });
  }

  for (const tr of outgoingTransfers) {
    statement.push({
      id: tr.id,
      date: tr.date,
      description: tr.description,
      amount: Number(tr.amount),
      currency: tr.currency,
      type: "EXPENSE",
      kind: "TRANSFER_OUT",
      counterpartAccountName: tr.destinationAccount.name,
    });
  }

  for (const tr of incomingTransfers) {
    statement.push({
      id: tr.id,
      date: tr.date,
      description: tr.description,
      amount: Number(tr.amount),
      currency: tr.currency,
      type: "INCOME",
      kind: "TRANSFER_IN",
      counterpartAccountName: tr.sourceAccount.name,
    });
  }

  statement.sort((a, b) => b.date.getTime() - a.date.getTime());

  let totalIncome = money(0);
  let totalExpense = money(0);

  for (const item of statement) {
    if (item.type === "INCOME") {
      totalIncome = totalIncome.plus(item.amount);
    } else {
      totalExpense = totalExpense.plus(item.amount);
    }
  }

  const net = totalIncome.minus(totalExpense);

  return {
    account: {
      id: account.id,
      name: account.name,
      type: account.type,
      institution: account.institution,
      currency: account.currency,
      initialBalance: Number(account.initialBalance),
      currentBalance: Number(account.currentBalance),
      convertedBalance,
    },
    monthSummary: {
      totalIncome: totalIncome.toNumber(),
      totalExpense: totalExpense.toNumber(),
      net: net.toNumber(),
    },
    statement,
    linkedCreditCards: linkedCards.map((c) => ({
      id: c.id,
      name: c.name,
      institution: c.institution,
      creditLimit: c.creditLimit !== null ? Number(c.creditLimit) : null,
      currency: c.currency,
      closingDay: c.closingDay,
      dueDay: c.dueDay,
    })),
    linkedRecurringExpenses: linkedRecurring.map((r) => ({
      id: r.id,
      description: r.description,
      amount: Number(r.amount),
      currency: r.currency,
      frequency: r.frequency,
    })),
  };
}
