import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/balance";

export async function getCategories(userId: string) {
  return prisma.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
}

export async function getAccountsList(userId: string) {
  return prisma.financialAccount.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
}

export async function getRecentTransactions(userId: string, take = 8) {
  const txs = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take,
    include: { account: true, category: true },
  });

  return txs.map((transaction) => ({
    id: transaction.id,
    description: transaction.description,
    type: transaction.type,
    date: transaction.date,
    amount: toNumber(transaction.amount),
    convertedAmount:
      toNumber(transaction.amount) * toNumber(transaction.fxRateAtCreation),
    accountName: transaction.account.name,
    accountCurrency: transaction.account.currency,
    categoryName: transaction.category?.name ?? null,
    categoryColor: transaction.category?.color ?? "#868e96",
  }));
}

export interface MonthlyData {
  total: number;
  income: number;
  expenses: number;
  byCategory: { name: string; color: string; value: number }[];
  transactions: {
    id: string;
    description: string;
    type: "INFLOW" | "OUTFLOW";
    date: Date;
    convertedAmount: number;
    accountName: string;
    categoryName: string | null;
    categoryColor: string;
  }[];
}

export async function getMonthlyTransactions(userId: string, year: number, month: number): Promise<MonthlyData> {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  const txs = await prisma.transaction.findMany({
    where: { userId, date: { gte: start, lt: end } },
    orderBy: { date: "desc" },
    include: { account: true, category: true },
  });

  let income = 0;
  let expenses = 0;

  const categoryMap = new Map<string, { name: string; color: string; value: number }>();

  const transactions = txs.map((transaction) => {
    const converted = toNumber(transaction.amount) * toNumber(transaction.fxRateAtCreation);

    if (transaction.type === "INFLOW") {
      income += converted;
    } else {
      expenses += converted;

      const key = transaction.category?.id ?? "uncategorized";
      const existing = categoryMap.get(key);
      const name = transaction.category?.name ?? "Uncategorized";
      const color = transaction.category?.color ?? "#868e96";

      if (existing) {
        existing.value += converted;
      } else {
        categoryMap.set(key, { name, color, value: converted });
      }
    }

    return {
      id: transaction.id,
      description: transaction.description,
      type: transaction.type as "INFLOW" | "OUTFLOW",
      date: transaction.date,
      convertedAmount: converted,
      accountName: transaction.account.name,
      categoryName: transaction.category?.name ?? null,
      categoryColor: transaction.category?.color ?? "#868e96",
    };
  });

  return {
    total: income - expenses,
    income,
    expenses,
    byCategory: Array.from(categoryMap.values()).sort((a, b) => b.value - a.value),
    transactions,
  };
}

export async function getRecurringExpenses(userId: string) {
  const items = await prisma.recurringExpense.findMany({
    where: { userId },
    orderBy: [{ active: "desc" }, { nextDueDate: "asc" }],
    include: { category: true },
  });

  return items.map((recurring) => ({
    id: recurring.id,
    name: recurring.name,
    amount: toNumber(recurring.amount),
    currency: recurring.currency,
    interval: recurring.interval,
    nextDueDate: recurring.nextDueDate,
    active: recurring.active,
    categoryName: recurring.category?.name ?? null,
    categoryColor: recurring.category?.color ?? "#868e96",
  }));
}

export async function getDebts(userId: string) {
  const debts = await prisma.debt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { payments: true },
  });

  return debts.map((debt) => {
    const paid = debt.payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
    const total = toNumber(debt.totalAmount);

    return {
      id: debt.id,
      debtorName: debt.debtorName,
      description: debt.description,
      totalAmount: total,
      currency: debt.currency,
      dueDate: debt.dueDate,
      status: debt.status,
      paid,
      remaining: Math.max(total - paid, 0),
      paymentCount: debt.payments.length,
    };
  });
}
