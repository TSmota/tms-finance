import type {
  Currency,
  Transaction,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { getExchangeRate, FX_RATE_SCALE } from "@/lib/fxService";
import { convertMoney, toStorage } from "@/lib/money";
import { monthRange, parseCalendarDate } from "@/lib/dates";
import { applyToBalance, balanceDelta, lockTransaction } from "@/lib/accountBalance";
import { assertCategoryOwned, requireAccount } from "@/lib/ownership";
import type { TransactionInput } from "@/lib/validations";

/**
 * Fluxo de caixa em conta bancária.
 *
 * Serviço puro de domínio: recebe `userId` explícito e não conhece `auth()`,
 * `revalidatePath` nem o formato de resposta da UI. Lança os erros de
 * `@/lib/errors`; quem traduz é a server action.
 *
 * Compra no cartão não passa por aqui: não move saldo e tem serviço próprio em
 * `@/lib/cardPurchases`.
 */

/**
 * Serviço dono do lançamento, quando não é este.
 *
 * Amortização e pagamento de fatura movem saldo de verdade, e por isso aparecem
 * nas listagens. Mas cada um é metade de uma escrita de dois lados: mexer neles
 * daqui deixa `Debt.remainingAmount` ou `Invoice.totalAmount` no valor de antes.
 */
export type ManagedBy = "debt" | "invoice";

function managedBy(row: { debtId: string | null; type: TransactionType }): ManagedBy | null {
  if (row.debtId !== null) {
    return "debt";
  }

  if (row.type === "INVOICE_PAYMENT") {
    return "invoice";
  }

  return null;
}

const MANAGED_ELSEWHERE: Record<ManagedBy, string> = {
  debt:
    "Este lançamento pertence a uma dívida. Ajuste-o pela tela de dívidas, " +
    "para que o valor restante acompanhe.",
  invoice:
    "Este lançamento é o pagamento de uma fatura. Desfaça o pagamento pela " +
    "tela do cartão, para que a fatura volte a ficar em aberto.",
};

/** Recusa o que pertence a dívida ou fatura. `NotFoundError` mentiria: a linha existe. */
async function requireEditableTransaction(userId: string, id: string) {
  const existing = await prisma.transaction.findFirst({
    where: { id, userId, accountId: { not: null } },
  });

  if (!existing) {
    throw new NotFoundError("Transação não encontrada");
  }

  const owner = managedBy(existing);

  if (owner) {
    throw new InvalidOperationError(MANAGED_ELSEWHERE[owner]);
  }

  return existing;
}

/**
 * Resolve a taxa e o valor na moeda da conta.
 *
 * O `convertedAmount` é sempre expresso na moeda da conta, porque é ele que
 * move o saldo. Quando as duas moedas coincidem, a taxa é 1 e nenhuma chamada
 * de rede acontece.
 */
async function resolveConversion(params: {
  amount: number;
  from: Currency;
  to: Currency;
  date: Date;
  manualRate?: number | null;
}) {
  const rate = await getExchangeRate({
    from: params.from,
    to: params.to,
    date: params.date,
    manualRate: params.manualRate,
  });

  return {
    exchangeRate: rate.toFixed(FX_RATE_SCALE),
    convertedAmount: convertMoney(params.amount, rate),
  };
}

export async function createTransaction(
  userId: string,
  input: TransactionInput,
): Promise<Transaction> {
  const account = await requireAccount(userId, input.accountId);
  await assertCategoryOwned(userId, input.categoryId);

  const date = parseCalendarDate(input.date);
  const { exchangeRate, convertedAmount } = await resolveConversion({
    amount: input.amount,
    from: input.currency,
    to: account.currency,
    date,
    manualRate: input.manualFxRate,
  });

  return prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId,
        type: input.type,
        status: "CONFIRMED",
        description: input.description,
        date,
        amount: toStorage(input.amount),
        currency: input.currency,
        exchangeRate,
        convertedAmount: toStorage(convertedAmount),
        accountId: account.id,
        categoryId: input.categoryId,
      },
    });

    await applyToBalance(tx, account.id, balanceDelta(created.type, created.convertedAmount));

    return created;
  });
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: TransactionInput,
): Promise<Transaction> {
  await requireEditableTransaction(userId, id);

  const account = await requireAccount(userId, input.accountId);
  await assertCategoryOwned(userId, input.categoryId);

  const date = parseCalendarDate(input.date);
  const { exchangeRate, convertedAmount } = await resolveConversion({
    amount: input.amount,
    from: input.currency,
    to: account.currency,
    date,
    manualRate: input.manualFxRate,
  });

  return prisma.$transaction(async (tx) => {
    // Desfaz o efeito antigo antes de aplicar o novo. Ajustar pelo delta seria
    // sutilmente errado quando a conta muda: são dois saldos diferentes.
    //
    // Relido sob lock: a leitura de `requireEditableTransaction` aconteceu
    // antes da conversão de moeda, e uma edição concorrente no meio faria este
    // estorno devolver o valor de antes dela.
    const previous = await lockTransaction(tx, id);

    if (!previous) {
      throw new NotFoundError("Transação não encontrada");
    }

    if (previous.accountId && previous.status === "CONFIRMED") {
      await applyToBalance(
        tx,
        previous.accountId,
        balanceDelta(previous.type, previous.convertedAmount).negated(),
      );
    }

    const updated = await tx.transaction.update({
      where: { id },
      data: {
        type: input.type,
        description: input.description,
        date,
        amount: toStorage(input.amount),
        currency: input.currency,
        exchangeRate,
        convertedAmount: toStorage(convertedAmount),
        accountId: account.id,
        categoryId: input.categoryId,
      },
    });

    // A edição não confirma nada: uma pendência editada segue pendente e fora
    // do saldo. Aplicar o delta creditaria uma projeção como se tivesse
    // acontecido.
    if (updated.status === "CONFIRMED") {
      await applyToBalance(tx, account.id, balanceDelta(updated.type, updated.convertedAmount));
    }

    return updated;
  });
}

export async function deleteTransaction(userId: string, id: string): Promise<void> {
  await requireEditableTransaction(userId, id);

  await prisma.$transaction(async (tx) => {
    const previous = await lockTransaction(tx, id);

    if (!previous) {
      throw new NotFoundError("Transação não encontrada");
    }

    await tx.transaction.delete({ where: { id } });

    if (previous.accountId && previous.status === "CONFIRMED") {
      await applyToBalance(
        tx,
        previous.accountId,
        balanceDelta(previous.type, previous.convertedAmount).negated(),
      );
    }
  });
}

// ---------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------

export interface TransactionListItem {
  id: string;
  description: string;
  type: TransactionType;
  /** `PENDING` = projeção de recorrente ainda não confirmada. */
  status: TransactionStatus;
  date: Date;
  /** Valor na moeda do lançamento. */
  amount: number;
  currency: Currency;
  /** Valor na moeda da conta — o que moveu o saldo. */
  convertedAmount: number;
  exchangeRate: number;
  accountId: string | null;
  accountName: string | null;
  accountCurrency: Currency | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  /**
   * Recorrente de valor estimado: a confirmação da pendência deve pedir
   * conferência do valor real.
   */
  isEstimated: boolean;
  /** Preenchido = a linha é só de leitura aqui; quem edita é o outro serviço. */
  managedBy: ManagedBy | null;
}

const listInclude = {
  account: { select: { name: true, currency: true } },
  category: { select: { name: true, color: true } },
  recurringExpense: { select: { isEstimated: true } },
} as const;

type TransactionWithRelations = Transaction & {
  account: { name: string; currency: Currency } | null;
  category: { name: string; color: string | null } | null;
  recurringExpense: { isEstimated: boolean } | null;
};

function toListItem(transaction: TransactionWithRelations): TransactionListItem {
  return {
    id: transaction.id,
    description: transaction.description,
    type: transaction.type,
    status: transaction.status,
    date: transaction.date,
    amount: transaction.amount.toNumber(),
    currency: transaction.currency,
    convertedAmount: transaction.convertedAmount.toNumber(),
    exchangeRate: transaction.exchangeRate.toNumber(),
    accountId: transaction.accountId,
    accountName: transaction.account?.name ?? null,
    accountCurrency: transaction.account?.currency ?? null,
    categoryId: transaction.categoryId,
    categoryName: transaction.category?.name ?? null,
    categoryColor: transaction.category?.color ?? null,
    isEstimated: transaction.recurringExpense?.isEstimated ?? false,
    managedBy: managedBy(transaction),
  };
}

/** Lançamentos de conta bancária de um mês (competência em UTC). */
export async function listMonthTransactions(
  userId: string,
  year: number,
  month: number,
): Promise<TransactionListItem[]> {
  const { start, end } = monthRange(year, month);

  const transactions = await prisma.transaction.findMany({
    where: { userId, accountId: { not: null }, date: { gte: start, lt: end } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: listInclude,
  });

  return transactions.map(toListItem);
}

/** Lançamentos mais recentes, para o painel. */
export async function listRecentTransactions(
  userId: string,
  take = 8,
): Promise<TransactionListItem[]> {
  const transactions = await prisma.transaction.findMany({
    where: { userId, accountId: { not: null } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
    include: listInclude,
  });

  return transactions.map(toListItem);
}
