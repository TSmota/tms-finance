import type { Currency } from "@prisma/client";

import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/dates";
import { money, type Money, type MoneyInput } from "@/lib/money";
import { resolveRatesToBase } from "@/lib/fxService";
import {
  rollupByCategory,
  sliceTotal,
  type CategoryRef,
  type CategorySlice,
  type RollupEntry,
} from "@/lib/categoryRollup";

/**
 * Agregações para painel e relatórios.
 *
 * Dois pontos sensíveis, ambos já responsáveis por número errado no passado.
 *
 * **1. `convertedAmount` está na moeda da conta ou do cartão, não na moeda base
 * do usuário.** Somar uma conta em BRL com outra em USD dá um número sem
 * significado, então toda agregação faz uma segunda conversão. Faltando
 * cotação, o total sai marcado como incompleto em vez de errado.
 *
 * **2. Fluxo de caixa e gasto por categoria não são a mesma coisa.** Compra no
 * cartão não sai da conta; o que sai é o pagamento da fatura, que não tem
 * categoria. Construir `byCategory` a partir do fluxo de caixa jogaria todo
 * gasto de cartão em "Sem categoria". Então:
 *
 * - `income` / `expenses` = **fluxo de caixa**: o que entrou e saiu das contas
 *   no mês, incluindo o pagamento de fatura.
 * - `byCategory` = **onde o dinheiro foi gasto**: despesas de conta mais
 *   compras no cartão pela data da compra, excluindo pagamento de fatura.
 *
 * A relação entre os dois é explícita e tem teste:
 * `expenses = totalPorCategoria − cardSpending + invoicePayments`.
 */

export type { CategorySlice };

export interface MonthSummary {
  /** Entradas confirmadas em conta, na moeda base. */
  income: number;
  /** Saídas confirmadas em conta, incluindo pagamento de fatura. */
  expenses: number;
  net: number;
  /** Compras no cartão com data no mês. Ainda não saíram de conta nenhuma. */
  cardSpending: number;
  /** Pagamentos de fatura do mês — a parcela de `expenses` que não tem categoria. */
  invoicePayments: number;
  /** Gasto por categoria raiz: despesas de conta + compras no cartão. */
  byCategory: CategorySlice[];
  /** Soma de `byCategory`, para a UI não recalcular. */
  spendingTotal: number;
  /** `false` quando alguma moeda não pôde ser convertida para a moeda base. */
  complete: boolean;
}

/** Categorias do usuário no formato que o rollup espera. */
async function categoryRefs(userId: string): Promise<CategoryRef[]> {
  return prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true, color: true, parentId: true },
  });
}

export async function getMonthSummary(
  userId: string,
  year: number,
  month: number,
  baseCurrency: Currency,
): Promise<MonthSummary> {
  const { start, end } = monthRange(year, month);
  const window = { gte: start, lt: end };

  const [accountRows, cardRows, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, accountId: { not: null }, status: "CONFIRMED", date: window },
      select: {
        type: true,
        convertedAmount: true,
        categoryId: true,
        account: { select: { currency: true } },
      },
    }),
    // Compras no cartão pela data da compra: é a resposta para "onde gastei em
    // agosto", e não a competência da fatura, que pode cair no mês seguinte.
    prisma.transaction.findMany({
      where: {
        userId,
        creditCardId: { not: null },
        type: { not: "INVOICE_PAYMENT" },
        date: window,
      },
      select: {
        convertedAmount: true,
        categoryId: true,
        creditCard: { select: { currency: true } },
      },
    }),
    categoryRefs(userId),
  ]);

  const { rates, complete } = await resolveRatesToBase(
    [
      ...accountRows.map((row) => row.account?.currency),
      ...cardRows.map((row) => row.creditCard?.currency),
    ].filter((currency): currency is Currency => currency !== undefined && currency !== null),
    baseCurrency,
  );

  /** Converte para a moeda base, ou `null` quando não há cotação. */
  const toBase = (value: MoneyInput, currency: Currency | undefined): Money | null => {
    const rate = currency ? rates.get(currency) : undefined;

    return rate === undefined ? null : money(value).times(rate);
  };

  let missing = false;
  let income = money(0);
  let accountExpenses = money(0);
  let invoicePayments = money(0);
  const spending: RollupEntry[] = [];

  for (const row of accountRows) {
    const value = toBase(row.convertedAmount, row.account?.currency);

    if (value === null) {
      missing = true;
      continue;
    }

    if (row.type === "INCOME") {
      income = income.plus(value);
      continue;
    }

    accountExpenses = accountExpenses.plus(value);

    if (row.type === "INVOICE_PAYMENT") {
      // Fora do gasto por categoria: o que a fatura pagou já foi contado como
      // compra, e contar de novo dobraria o mês.
      invoicePayments = invoicePayments.plus(value);
      continue;
    }

    spending.push({ categoryId: row.categoryId, value });
  }

  let cardSpending = money(0);

  for (const row of cardRows) {
    const value = toBase(row.convertedAmount, row.creditCard?.currency);

    if (value === null) {
      missing = true;
      continue;
    }

    cardSpending = cardSpending.plus(value);
    spending.push({ categoryId: row.categoryId, value });
  }

  const byCategory = rollupByCategory(categories, spending);

  return {
    income: income.toNumber(),
    expenses: accountExpenses.toNumber(),
    net: income.minus(accountExpenses).toNumber(),
    cardSpending: cardSpending.toNumber(),
    invoicePayments: invoicePayments.toNumber(),
    byCategory,
    spendingTotal: sliceTotal(byCategory),
    complete: complete && !missing,
  };
}

export interface OpenInvoices {
  /** Total das faturas não pagas, na moeda base. */
  total: number;
  count: number;
  /** Vencimento mais próximo entre as faturas em aberto. */
  nextDueDate: Date | null;
  complete: boolean;
}

/**
 * Faturas em aberto de todos os cartões.
 *
 * Sem recorte por vencimento, diferente de `@/lib/projection`: aqui a pergunta
 * é "quanto eu devo de cartão", não "quanto sai deste mês".
 */
export async function getOpenInvoices(
  userId: string,
  baseCurrency: Currency,
): Promise<OpenInvoices> {
  const invoices = await prisma.invoice.findMany({
    where: { userId, status: { not: "PAID" } },
    select: { totalAmount: true, currency: true, dueDate: true },
    orderBy: { dueDate: "asc" },
  });

  const { rates, complete } = await resolveRatesToBase(
    invoices.map((invoice) => invoice.currency),
    baseCurrency,
  );

  let total = money(0);
  let missing = false;
  let counted = 0;

  for (const invoice of invoices) {
    const rate = rates.get(invoice.currency);

    if (rate === undefined) {
      missing = true;
      continue;
    }

    // Fatura sem lançamento nenhum não é dívida; não entra na contagem.
    if (money(invoice.totalAmount).isZero()) {
      continue;
    }

    total = total.plus(money(invoice.totalAmount).times(rate));
    counted += 1;
  }

  const nextDue = invoices.find((invoice) => !money(invoice.totalAmount).isZero());

  return {
    total: total.toNumber(),
    count: counted,
    nextDueDate: nextDue?.dueDate ?? null,
    complete: complete && !missing,
  };
}

export interface DebtsByCategory {
  /** A receber por categoria de origem, na moeda base. */
  receivable: CategorySlice[];
  /** A pagar por categoria de origem. */
  payable: CategorySlice[];
  receivableTotal: number;
  payableTotal: number;
  complete: boolean;
}

/**
 * Dívidas em aberto agrupadas pela categoria de origem.
 *
 * Não só *para quem* se deve, mas *com o quê* aquele valor foi gasto.
 */
export async function getDebtsByCategory(
  userId: string,
  baseCurrency: Currency,
): Promise<DebtsByCategory> {
  const [debts, categories] = await Promise.all([
    prisma.debt.findMany({
      where: { userId, status: { not: "PAID" } },
      select: { type: true, categoryId: true, remainingAmount: true, currency: true },
    }),
    categoryRefs(userId),
  ]);

  const { rates, complete } = await resolveRatesToBase(
    debts.map((debt) => debt.currency),
    baseCurrency,
  );

  const receivable: RollupEntry[] = [];
  const payable: RollupEntry[] = [];
  let missing = false;

  for (const debt of debts) {
    const rate = rates.get(debt.currency);

    if (rate === undefined) {
      missing = true;
      continue;
    }

    const entry = {
      categoryId: debt.categoryId,
      value: money(debt.remainingAmount).times(rate),
    };

    (debt.type === "LENT" ? receivable : payable).push(entry);
  }

  const receivableSlices = rollupByCategory(categories, receivable);
  const payableSlices = rollupByCategory(categories, payable);

  return {
    receivable: receivableSlices,
    payable: payableSlices,
    receivableTotal: sliceTotal(receivableSlices),
    payableTotal: sliceTotal(payableSlices),
    complete: complete && !missing,
  };
}
