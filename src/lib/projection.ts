import type { Currency } from "@prisma/client";

import { prisma } from "@/lib/db";
import { money, sumMoney, type Money, type MoneyInput } from "@/lib/money";
import { resolveRatesToBase } from "@/lib/fxService";
import { projectionHorizon } from "@/lib/recurring";

/**
 * Saldo projetado.
 *
 * Responde "quanto eu devo ter no fim deste mês, se tudo o que está previsto
 * acontecer".
 *
 * Composição, tudo convertido para a moeda base:
 *
 *   saldo atual (confirmado)
 *   + pendências de entrada    (transações PENDING de receita)
 *   − pendências de saída      (transações PENDING de despesa)
 *   − faturas em aberto        (não pagas, que vencem até o horizonte)
 *
 * Pendências e faturas vencidas de meses anteriores entram: uma conta de julho
 * que ninguém confirmou continua sendo dinheiro a sair.
 *
 * Compra no cartão não aparece como pendência — ela vive na fatura, e é a
 * fatura que entra aqui. Contar as duas seria contar duas vezes.
 *
 * Faltando cotação, o total sai marcado como incompleto em vez de errado.
 */

export interface BalanceProjection {
  /** Soma dos saldos atuais das contas, na moeda base. */
  currentBalance: number;
  pendingIncome: number;
  pendingExpenses: number;
  /** Total das faturas não pagas com vencimento dentro do horizonte. */
  unpaidInvoices: number;
  /** `currentBalance + pendingIncome − pendingExpenses − unpaidInvoices`. */
  projectedBalance: number;
  /** Quantidade de pendências que compõem a projeção. */
  pendingCount: number;
  /** Primeiro instante fora da janela projetada. */
  horizon: Date;
  /** `false` quando alguma moeda não pôde ser convertida para a moeda base. */
  complete: boolean;
}

export async function getBalanceProjection(
  userId: string,
  year: number,
  month: number,
  baseCurrency: Currency,
): Promise<BalanceProjection> {
  const horizon = projectionHorizon(year, month);

  const [accounts, pending, invoices] = await Promise.all([
    prisma.financialAccount.findMany({
      where: { userId },
      select: { currency: true, currentBalance: true },
    }),
    prisma.transaction.findMany({
      where: { userId, status: "PENDING", accountId: { not: null }, date: { lt: horizon } },
      select: { type: true, convertedAmount: true, account: { select: { currency: true } } },
    }),
    prisma.invoice.findMany({
      where: { userId, status: { not: "PAID" }, dueDate: { lt: horizon } },
      select: { currency: true, totalAmount: true },
    }),
  ]);

  const { rates, complete } = await resolveRatesToBase(
    [
      ...accounts.map((account) => account.currency),
      ...pending.map((transaction) => transaction.account?.currency),
      ...invoices.map((invoice) => invoice.currency),
    ].filter((currency): currency is Currency => currency !== undefined && currency !== null),
    baseCurrency,
  );

  /** Converte para a moeda base, ou `null` quando não há cotação. */
  const toBase = (value: MoneyInput, currency: Currency | undefined): Money | null => {
    const rate = currency ? rates.get(currency) : undefined;

    return rate === undefined ? null : money(value).times(rate);
  };

  let missing = false;

  /** Soma o que pôde ser convertido e registra o que não pôde. */
  const total = (values: (Money | null)[]): Money => {
    const usable = values.filter((value): value is Money => value !== null);

    if (usable.length !== values.length) {
      missing = true;
    }

    return sumMoney(usable);
  };

  const currentBalance = total(
    accounts.map((account) => toBase(account.currentBalance, account.currency)),
  );

  const pendingIncome = total(
    pending
      .filter((transaction) => transaction.type === "INCOME")
      .map((transaction) => toBase(transaction.convertedAmount, transaction.account?.currency)),
  );

  const pendingExpenses = total(
    pending
      .filter((transaction) => transaction.type !== "INCOME")
      .map((transaction) => toBase(transaction.convertedAmount, transaction.account?.currency)),
  );

  const unpaidInvoices = total(
    invoices.map((invoice) => toBase(invoice.totalAmount, invoice.currency)),
  );

  const projectedBalance = currentBalance
    .plus(pendingIncome)
    .minus(pendingExpenses)
    .minus(unpaidInvoices);

  return {
    currentBalance: currentBalance.toNumber(),
    pendingIncome: pendingIncome.toNumber(),
    pendingExpenses: pendingExpenses.toNumber(),
    unpaidInvoices: unpaidInvoices.toNumber(),
    projectedBalance: projectedBalance.toNumber(),
    pendingCount: pending.length,
    horizon,
    complete: complete && !missing,
  };
}
