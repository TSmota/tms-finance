import type { CreditCard, Currency, Invoice } from "@prisma/client";

import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { money, toStorage, type Money } from "@/lib/money";
import type { Tx } from "@/lib/accountBalance";
import { invoiceCycleDates, type Competency } from "@/lib/invoiceCycle";

/**
 * Faturas de cartão.
 *
 * A fatura nasce quando o primeiro lançamento da competência é registrado, não
 * por rotina agendada. `resolveInvoice` é o único caminho para obtê-la.
 */

interface ResolveInvoiceParams {
  userId: string;
  card: { id: string; closingDay: number; dueDay: number; currency: Currency };
  competency: Competency;
}

/**
 * Fatura da competência, criando-a se ainda não existir.
 *
 * Idempotente e seguro sob concorrência. Duas compras simultâneas no mesmo
 * ciclo disputam a criação da mesma fatura.
 *
 * Nem `upsert` nem try/catch resolvem: o Prisma pode traduzir o upsert como
 * SELECT seguido de INSERT, que perde a corrida, e violação de constraint
 * **aborta a transação** no Postgres — capturar o erro e reler dentro do mesmo
 * `$transaction` falha com "current transaction is aborted". `createMany` com
 * `skipDuplicates` compila para `INSERT ... ON CONFLICT DO NOTHING`, que não
 * levanta erro.
 *
 * A fatura volta **travada**. Inserir um lançamento que a referencia toma um
 * `FOR KEY SHARE` na linha, e `recalcInvoiceTotal` pede `FOR UPDATE` sobre ela
 * depois: duas compras concorrentes chegariam cada uma segurando o `KEY SHARE`
 * da outra, e o Postgres derrubaria uma com `40P01`. Travar antes de inserir
 * transforma isso numa fila.
 *
 * A trava é por chave única, não por id, para evitar uma leitura extra só para
 * descobrir o id.
 */
export async function resolveInvoice(tx: Tx, params: ResolveInvoiceParams): Promise<Invoice> {
  const { userId, card, competency } = params;
  const { closingDate, dueDate } = invoiceCycleDates(card, competency);

  const identity = {
    creditCardId: card.id,
    month: competency.month,
    year: competency.year,
  };

  await tx.invoice.createMany({
    data: [{ ...identity, userId, closingDate, dueDate, currency: card.currency }],
    skipDuplicates: true,
  });

  await tx.$queryRaw`
    SELECT id FROM finance.invoices
     WHERE credit_card_id = ${card.id}::uuid
       AND month = ${competency.month}
       AND year = ${competency.year}
     FOR UPDATE`;

  return tx.invoice.findUniqueOrThrow({
    where: { creditCardId_month_year: identity },
  });
}

/**
 * Recalcula e grava o total da fatura a partir dos seus lançamentos.
 *
 * Exclui `INVOICE_PAYMENT`: a transação de pagamento também aponta para a
 * fatura, e incluí-la zeraria o total no momento em que ela é criada.
 *
 * Trava a linha antes de somar. Sem o `FOR UPDATE`, duas compras simultâneas
 * somam cada uma o próprio snapshot e a última gravação vence, perdendo valor.
 *
 * Faturas são sempre travadas em ordem crescente de competência, o que evita
 * deadlock entre compras parceladas concorrentes.
 */
export async function recalcInvoiceTotal(tx: Tx, invoiceId: string): Promise<Money> {
  await tx.$queryRaw`SELECT id FROM finance.invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;

  const aggregate = await tx.transaction.aggregate({
    where: { invoiceId, type: { not: "INVOICE_PAYMENT" } },
    _sum: { convertedAmount: true },
  });

  const total = money(aggregate._sum.convertedAmount ?? 0);

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { totalAmount: toStorage(total) },
  });

  return total;
}

/**
 * Recalcula o total de várias faturas de uma vez.
 *
 * Sempre em ordem crescente de competência. Iterar um `Set` na ordem de chegada
 * deixaria a ordem dos locks depender do que o Postgres devolveu, e duas
 * operações concorrentes sobre as mesmas faturas podem travar em sentidos
 * opostos.
 */
export async function recalcInvoiceTotals(
  tx: Tx,
  invoiceIds: Iterable<string>,
): Promise<void> {
  const ids = [...new Set(invoiceIds)];

  if (ids.length === 0) {
    return;
  }

  const ordered = await tx.invoice.findMany({
    where: { id: { in: ids } },
    orderBy: [{ year: "asc" }, { month: "asc" }],
    select: { id: true },
  });

  for (const invoice of ordered) {
    await recalcInvoiceTotal(tx, invoice.id);
  }
}

/** Fatura do usuário, ou {@link NotFoundError}. */
export async function requireInvoice(
  userId: string,
  invoiceId: string,
): Promise<Invoice & { creditCard: CreditCard }> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: { creditCard: true },
  });

  if (!invoice) {
    throw new NotFoundError("Fatura não encontrada");
  }

  return invoice;
}

export interface InvoiceSummary {
  id: string;
  year: number;
  month: number;
  status: "OPEN" | "CLOSED" | "PAID";
  closingDate: Date;
  dueDate: Date;
  currency: Currency;
  total: number;
  paidAt: Date | null;
  paymentAccountId: string | null;
  itemCount: number;
}

function toSummary(invoice: Invoice & { _count: { transactions: number } }): InvoiceSummary {
  return {
    id: invoice.id,
    year: invoice.year,
    month: invoice.month,
    status: invoice.status,
    closingDate: invoice.closingDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    total: invoice.totalAmount.toNumber(),
    paidAt: invoice.paidAt,
    paymentAccountId: invoice.paymentAccountId,
    itemCount: invoice._count.transactions,
  };
}

/** Faturas de um cartão, da mais recente para a mais antiga. */
export async function listCardInvoices(
  userId: string,
  creditCardId: string,
): Promise<InvoiceSummary[]> {
  const invoices = await prisma.invoice.findMany({
    where: { userId, creditCardId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: { _count: { select: { transactions: true } } },
  });

  return invoices.map(toSummary);
}

export interface InvoiceItem {
  id: string;
  description: string;
  date: Date;
  amount: number;
  currency: Currency;
  exchangeRate: number;
  convertedAmount: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  /** 1ª parcela do grupo — a âncora que identifica a compra inteira. */
  anchorId: string;
  /**
   * Valor cheio da compra na moeda do lançamento, somando todas as parcelas.
   *
   * Quem clica em editar a parcela 2/3 espera ver o total da compra, não os
   * 33,33 daquela linha.
   */
  groupTotal: number;
  /** Verdadeiro quando a compra veio de um gasto recorrente. */
  fromRecurring: boolean;
}

/** Lançamentos de uma fatura, sem a transação de pagamento. */
export async function listInvoiceItems(
  userId: string,
  invoiceId: string,
): Promise<InvoiceItem[]> {
  const items = await prisma.transaction.findMany({
    where: { userId, invoiceId, type: { not: "INVOICE_PAYMENT" } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { category: { select: { name: true, color: true } } },
  });

  const totalByAnchor = await groupTotals(
    userId,
    items.map((item) => item.parentInstallmentId ?? item.id),
  );

  return items.map((item) => ({
    id: item.id,
    description: item.description,
    date: item.date,
    amount: item.amount.toNumber(),
    currency: item.currency,
    exchangeRate: item.exchangeRate.toNumber(),
    convertedAmount: item.convertedAmount.toNumber(),
    categoryId: item.categoryId,
    categoryName: item.category?.name ?? null,
    categoryColor: item.category?.color ?? null,
    installmentNumber: item.installmentNumber,
    totalInstallments: item.totalInstallments,
    anchorId: item.parentInstallmentId ?? item.id,
    groupTotal:
      totalByAnchor.get(item.parentInstallmentId ?? item.id) ?? item.amount.toNumber(),
    fromRecurring: item.recurringExpenseId !== null,
  }));
}

/**
 * Soma das parcelas de cada grupo, na moeda do lançamento.
 *
 * Uma consulta para todos os grupos presentes na fatura, em vez de uma por
 * item: as parcelas irmãs moram em outras faturas, então sem isso a listagem
 * faria N+1 para montar o formulário de edição.
 */
async function groupTotals(
  userId: string,
  anchorIds: string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(anchorIds)];

  if (ids.length === 0) {
    return new Map();
  }

  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      OR: [{ id: { in: ids } }, { parentInstallmentId: { in: ids } }],
    },
    select: { id: true, parentInstallmentId: true, amount: true },
  });

  const totals = new Map<string, Money>();

  for (const row of rows) {
    const anchor = row.parentInstallmentId ?? row.id;

    totals.set(anchor, (totals.get(anchor) ?? money(0)).plus(row.amount));
  }

  return new Map([...totals].map(([anchor, total]) => [anchor, total.toNumber()]));
}
