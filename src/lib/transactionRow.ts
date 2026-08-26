import type { Currency } from "@prisma/client";

import type { ManagedBy, TransactionListItem } from "@/lib/transactions";

/**
 * A linha que `TransactionsTable` desenha, e a conversão a partir do DTO do
 * serviço.
 *
 * Client-safe: só `import type` do serviço, que o TypeScript apaga — nada do
 * Prisma entra no bundle. Mora aqui, e não no componente, porque o painel e a
 * tela de transações precisam da conversão no servidor, onde um módulo
 * `"use client"` só oferece referências.
 */
export interface TransactionRow {
  id: string;
  date: Date;
  description: string;
  type: "INCOME" | "EXPENSE";
  /**
   * `PENDING` = ocorrência de recorrente ainda não confirmada. Está
   * fora do saldo e da projeção de receitas/despesas do mês.
   */
  status: "PENDING" | "CONFIRMED";
  /** Valor na moeda do lançamento. */
  amount: number;
  currency: Currency;
  /** Valor na moeda da conta — o que efetivamente moveu o saldo. */
  convertedAmount: number;
  exchangeRate: number;
  accountId: string;
  accountName: string;
  accountCurrency: Currency;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  /** Recorrente de valor estimado: a confirmação pede conferência. */
  isEstimated: boolean;
  /** Preenchido = só de leitura aqui; editar exige desfazer os dois lados. */
  managedBy: ManagedBy | null;
}

/** `baseCurrency` cobre o lançamento sem conta — pagamento de fatura tem `accountId`, compra de cartão não. */
export function toTransactionRow(
  transaction: TransactionListItem,
  baseCurrency: Currency,
): TransactionRow {
  return {
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    // `INVOICE_PAYMENT` conta como saída: a coluna de valor só pergunta o sinal.
    type: transaction.type === "INCOME" ? "INCOME" : "EXPENSE",
    status: transaction.status,
    amount: transaction.amount,
    currency: transaction.currency,
    convertedAmount: transaction.convertedAmount,
    exchangeRate: transaction.exchangeRate,
    accountId: transaction.accountId ?? "",
    accountName: transaction.accountName ?? "—",
    accountCurrency: transaction.accountCurrency ?? baseCurrency,
    categoryId: transaction.categoryId,
    categoryName: transaction.categoryName,
    categoryColor: transaction.categoryColor,
    isEstimated: transaction.isEstimated,
    managedBy: transaction.managedBy,
  };
}
