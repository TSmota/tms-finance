import type {
  CreditCard,
  Transaction,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError } from "@/lib/errors";
import { FX_RATE_SCALE } from "@/lib/fxService";
import { convertMoney, toStorage, type Money } from "@/lib/money";
import { splitInstallments } from "@/lib/installments";
import { consecutiveCompetencies, invoiceCompetencyFor } from "@/lib/invoiceCycle";
import { recalcInvoiceTotals, resolveInvoice } from "@/lib/invoices";
import {
  affectsBalance,
  applyToBalance,
  balanceDelta,
  type Tx,
} from "@/lib/accountBalance";
import { originType } from "@/lib/debts";
import type { DebtTypeCode } from "@/lib/debtTypes";
import type { DebtInput } from "@/lib/validations";

/**
 * A movimentação que origina uma dívida, do lado do dinheiro.
 *
 * Ela tem duas formas: um lançamento numa conta bancária, que move saldo na
 * hora, ou uma compra no cartão, que só acumula na fatura. E pode ser mais de
 * uma linha — no cartão, uma parcela por fatura.
 *
 * O grupo é **derivado do tipo**: `originType` e `settlementType` são sempre
 * opostos, então a origem é toda transação da dívida com o tipo da origem, e as
 * amortizações são o resto. O porquê está no ARCHITECTURE.md, §6.
 *
 * `debts.ts` continua dono das invariantes da dívida; este módulo é dono de onde
 * o dinheiro da origem mora.
 */

export type OriginTarget = { kind: "account"; id: string } | { kind: "card"; id: string };

export interface LoadedOrigin {
  transactions: Array<{
    id: string;
    accountId: string | null;
    creditCardId: string | null;
    invoiceId: string | null;
    status: TransactionStatus;
    type: TransactionType;
    installmentNumber: number | null;
  }>;
  target: OriginTarget | null;
  date: Date | null;
  installments: number;
  invoiceIds: string[];
  locked: boolean;
}

/**
 * O grupo de origem gravado, com o destino resolvido.
 *
 * Fora de `$transaction` de propósito: é a leitura que decide o caminho, e quem
 * escreve trava as linhas de novo depois.
 */
export async function loadOrigin(
  userId: string,
  debt: { id: string; type: DebtTypeCode },
): Promise<LoadedOrigin> {
  const rows = await prisma.transaction.findMany({
    where: { userId, debtId: debt.id, type: originType(debt.type) },
    orderBy: [{ installmentNumber: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      accountId: true,
      creditCardId: true,
      invoiceId: true,
      status: true,
      type: true,
      date: true,
      installmentNumber: true,
      invoice: { select: { status: true } },
    },
  });

  const first = rows[0];

  return {
    transactions: rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      creditCardId: row.creditCardId,
      invoiceId: row.invoiceId,
      status: row.status,
      type: row.type,
      installmentNumber: row.installmentNumber,
    })),
    target: originTargetOf(first),
    date: first?.date ?? null,
    installments: rows.length,
    invoiceIds: rows
      .map((row) => row.invoiceId)
      .filter((id): id is string => id !== null),
    locked: rows.some((row) => row.invoice?.status === "PAID"),
  };
}

/**
 * Destino de uma linha de origem. Exportada porque `debts.ts` monta o mesmo
 * campo nas leituras, e duas cópias divergiriam.
 */
export function originTargetOf(
  row: { accountId: string | null; creditCardId: string | null } | undefined,
): OriginTarget | null {
  if (!row) {
    return null;
  }

  if (row.accountId) {
    return { kind: "account", id: row.accountId };
  }

  return row.creditCardId ? { kind: "card", id: row.creditCardId } : null;
}

/**
 * Recusa mexer numa origem que está em fatura paga (RN-03.5).
 *
 * O dinheiro já saiu pelo total antigo daquela fatura: apagar ou alterar a
 * parcela deixaria `total_amount` menor que o valor pago, com a fatura ainda
 * `PAID`.
 */
export function assertOriginEditable(
  origin: LoadedOrigin,
  action: "editar" | "remover",
): void {
  if (origin.locked) {
    throw new InvalidOperationError(
      `A origem desta dívida está em uma fatura paga. Desfaça o pagamento antes de ${action}.`,
    );
  }
}

export interface CreateOriginParams {
  userId: string;
  debtId: string;
  type: TransactionType;
  input: DebtInput;
  date: Date;
  rate: Money;
  status?: TransactionStatus;
  /** Cartão de destino, já com a posse conferida. Nulo = origem em conta. */
  card?: CreditCard | null;
}

/**
 * Cria o grupo de origem no destino escolhido.
 *
 * `rate` chega resolvida: `getExchangeRate` é rede, e uma cotação lenta com a
 * `$transaction` aberta prenderia o lock da dívida e das faturas.
 */
export async function createOrigin(
  tx: Tx,
  params: CreateOriginParams,
): Promise<Transaction[]> {
  if (params.card) {
    return createCardOrigin(tx, params);
  }

  return createAccountOrigin(tx, params);
}

async function createAccountOrigin(
  tx: Tx,
  params: CreateOriginParams,
): Promise<Transaction[]> {
  const { userId, debtId, type, input, date, rate, status } = params;

  if (!input.accountId) {
    throw new InvalidOperationError(
      "Escolha a origem: conta bancária ou cartão de crédito",
    );
  }

  const created = await tx.transaction.create({
    data: {
      userId,
      type,
      status: status ?? "CONFIRMED",
      description: input.description,
      date,
      amount: toStorage(input.amount),
      currency: input.currency,
      exchangeRate: rate.toFixed(FX_RATE_SCALE),
      convertedAmount: toStorage(convertMoney(input.amount, rate)),
      accountId: input.accountId,
      categoryId: input.categoryId,
      debtId,
    },
  });

  if (affectsBalance(created)) {
    await applyToBalance(
      tx,
      input.accountId,
      balanceDelta(created.type, created.convertedAmount),
    );
  }

  return [created];
}

/**
 * Distribui a origem em faturas consecutivas, como qualquer compra parcelada.
 *
 * A divisão é sobre o valor na moeda do lançamento e cada parcela usa a mesma
 * taxa, o que mantém `amount × exchangeRate = convertedAmount` verdadeiro linha
 * a linha. Todas ficam com a data da compra: é o `invoiceId` que diz a que mês
 * cada uma pertence.
 */
async function createCardOrigin(
  tx: Tx,
  params: CreateOriginParams,
): Promise<Transaction[]> {
  const { userId, debtId, type, input, date, rate, card } = params;

  if (!card) {
    throw new InvalidOperationError("Cartão de origem não informado");
  }

  const exchangeRate = rate.toFixed(FX_RATE_SCALE);
  const parts = splitInstallments(input.amount, input.installments);
  const competencies = consecutiveCompetencies(
    invoiceCompetencyFor(card, date),
    input.installments,
  );

  const created: Transaction[] = [];
  const touched = new Set<string>();
  let parentInstallmentId: string | null = null;

  for (const [index, part] of parts.entries()) {
    const invoice = await resolveInvoice(tx, {
      userId,
      card,
      competency: competencies[index]!,
    });

    const installment: Transaction = await tx.transaction.create({
      data: {
        userId,
        type,
        status: "CONFIRMED",
        description: input.description,
        date,
        amount: toStorage(part),
        currency: input.currency,
        exchangeRate,
        convertedAmount: toStorage(convertMoney(part, rate)),
        creditCardId: card.id,
        invoiceId: invoice.id,
        categoryId: input.categoryId,
        debtId,
        installmentNumber: index + 1,
        totalInstallments: input.installments,
        // A 1ª parcela é a âncora; as seguintes apontam para ela.
        parentInstallmentId,
      },
    });

    parentInstallmentId ??= installment.id;
    created.push(installment);
    touched.add(invoice.id);
  }

  // Um recalculo por fatura no fim, não um por parcela: `recalcInvoiceTotals`
  // mantém a ordem crescente que evita deadlock.
  await recalcInvoiceTotals(tx, touched);

  return created;
}

/** Apaga o grupo de origem, desfazendo o efeito de cada linha. */
export async function deleteOrigin(tx: Tx, origin: LoadedOrigin): Promise<void> {
  for (const row of origin.transactions) {
    if (row.accountId && row.status === "CONFIRMED") {
      // A Task 7 troca por lockTransaction, junto com a ordem de lock de updateDebt.
      const locked = await tx.transaction.findUniqueOrThrow({
        where: { id: row.id },
        select: { type: true, convertedAmount: true },
      });

      await applyToBalance(
        tx,
        row.accountId,
        balanceDelta(locked.type, locked.convertedAmount).negated(),
      );
    }
  }

  await tx.transaction.deleteMany({
    where: { id: { in: origin.transactions.map((row) => row.id) } },
  });

  // Fatura que ficou sem lançamento é apagada por `recalcInvoiceTotal`, o que
  // fecha o ciclo que `resolveInvoice` abriu.
  await recalcInvoiceTotals(tx, origin.invoiceIds);
}
