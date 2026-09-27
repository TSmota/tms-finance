import type { Currency } from "@prisma/client";
import { prisma } from "@/lib/db";
import { competencyFxDate } from "@/lib/reports";
import { utcDate, competencyOf } from "@/lib/dates";
import { money } from "@/lib/money";
import { resolveRatesToBase } from "@/lib/fxService";

export interface HistoryMonth {
  label: string; income: number; expenses: number; net: number; complete: boolean;
}

/** Janela limitada: doze competências incluindo a selecionada. */
export async function getMonthlyHistory(userId: string, year: number, month: number, currency: Currency): Promise<HistoryMonth[]> {
  // Uma leitura do período, sem repetir consultas de categorias e compras de cartão.
  const rows = await prisma.transaction.findMany({
    where: { userId, accountId: { not: null }, status: "CONFIRMED", date: { gte: utcDate(year, month - 11, 1), lt: utcDate(year, month + 1, 1) } },
    select: { date: true, type: true, convertedAmount: true, account: { select: { currency: true } } },
  });
  const periods = Array.from({ length: 12 }, (_, index) => competencyOf(utcDate(year, month - 11 + index, 1)));
  return Promise.all(periods.map(async (period): Promise<HistoryMonth> => {
    const entries = rows.filter((row) => row.date.getUTCFullYear() === period.year && row.date.getUTCMonth() + 1 === period.month);
    const { rates, complete } = await resolveRatesToBase(entries.flatMap((row) => row.account ? [row.account.currency] : []), currency, competencyFxDate(period.year, period.month));
    let income = money(0);
    let expenses = money(0);
    let missing = false;
    for (const row of entries) {
      const rate = row.account ? rates.get(row.account.currency) : undefined;
      if (rate === undefined) {
        missing = true;
        continue;
      }
      const value = money(row.convertedAmount).times(rate);
      if (row.type === "INCOME") {
        income = income.plus(value);
      } else {
        expenses = expenses.plus(value);
      }
    }
    return { label: `${String(period.month).padStart(2, "0")}/${period.year}`, income: income.toNumber(), expenses: expenses.toNumber(), net: income.minus(expenses).toNumber(), complete: complete && !missing };
  }));
}

/** Posição atual: contas + recebíveis − empréstimos a pagar − todas as faturas abertas. */
export async function getNetWorth(userId: string, currency: Currency): Promise<{ amount: number; complete: boolean }> {
  const [accounts, debts, invoices] = await Promise.all([
    prisma.financialAccount.findMany({ where: { userId }, select: { currency: true, currentBalance: true } }),
    prisma.debt.findMany({ where: { userId, status: { not: "PAID" } }, select: { currency: true, type: true, remainingAmount: true } }),
    prisma.invoice.findMany({ where: { userId, status: { not: "PAID" } }, select: { currency: true, totalAmount: true } }),
  ]);
  const rows = [
    ...accounts.map((row) => ({ currency: row.currency, value: money(row.currentBalance) })),
    ...debts.map((row) => ({ currency: row.currency, value: money(row.remainingAmount).times(row.type === "LENT" ? 1 : -1) })),
    ...invoices.map((row) => ({ currency: row.currency, value: money(row.totalAmount).negated() })),
  ];
  const { rates, complete } = await resolveRatesToBase(rows.map((row) => row.currency), currency);
  const total = rows.reduce((sum, row) => {
    const rate = rates.get(row.currency);
    return rate === undefined ? sum : sum.plus(row.value.times(rate));
  }, money(0));
  return { amount: total.toNumber(), complete };
}
