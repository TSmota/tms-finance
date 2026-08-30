import type { CreditCard, Currency, Invoice } from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError, PaidInvoiceError } from "@/lib/errors";
import { money, toStorage, type Money } from "@/lib/money";
import type { Tx } from "@/lib/accountBalance";
import { invoiceCycleDates, type Competency } from "@/lib/invoiceCycle";

/**
 * Faturas de cartão.
 *
 * A fatura nasce quando o primeiro lançamento da competência é registrado, não
 * por rotina agendada, e some quando o último sai. `resolveInvoice` é o único
 * caminho para obtê-la; `recalcInvoiceTotal`, o único que a apaga.
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
 *
 * **Recusa fatura paga.** Todos os chamadores inserem lançamento na fatura que
 * recebem, e o total de uma fatura paga é o valor que já saiu da conta: subi-lo
 * deixaria a fatura `PAID` por um número que ninguém pagou. A guarda vive aqui
 * porque este é o único caminho — nos chamadores, seriam três cópias.
 *
 * **Repete uma vez se a linha sumir.** `recalcInvoiceTotal` apaga a fatura que
 * fica vazia, e ela pode ser a que estamos esperando: quem espera no `FOR
 * UPDATE` volta sem linha alguma quando a exclusão concorrente commita. A
 * segunda passada reinsere — o `ON CONFLICT DO NOTHING` vira INSERT de verdade
 * — e a linha nova é nossa até o fim da transação.
 */
export async function resolveInvoice(tx: Tx, params: ResolveInvoiceParams): Promise<Invoice> {
  const { userId, card, competency } = params;
  const { closingDate, dueDate } = invoiceCycleDates(card, competency);

  const identity = {
    creditCardId: card.id,
    month: competency.month,
    year: competency.year,
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
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

    const invoice = await tx.invoice.findUnique({
      where: { creditCardId_month_year: identity },
    });

    if (!invoice) {
      continue;
    }

    if (invoice.status === "PAID") {
      throw new PaidInvoiceError(
        `A fatura de ${competency.month}/${competency.year} já foi paga. ` +
          "Desfaça o pagamento antes de lançar nela.",
      );
    }

    return invoice;
  }

  throw new InvalidOperationError(
    `Não foi possível abrir a fatura de ${competency.month}/${competency.year}. Tente de novo.`,
  );
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
 *
 * **Apaga a fatura que ficou sem lançamento nenhum**, fechando o ciclo de vida
 * que `resolveInvoice` abre: mover a última compra para outro mês deixaria uma
 * fatura em aberto de zero, que a tela não sabe pagar nem remover.
 *
 * A condição inteira mora no `where`, sob o lock que a função já toma: conferir
 * e apagar em dois passos abriria janela para um lançamento no meio. O filtro é
 * sobre *todos* os lançamentos, e não sobre a soma acima — `Transaction.invoice`
 * é `onDelete: Cascade`, então apagar uma fatura ainda referenciada levaria o
 * histórico junto, em silêncio.
 */
export async function recalcInvoiceTotal(tx: Tx, invoiceId: string): Promise<Money> {
  await tx.$queryRaw`SELECT id FROM finance.invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;

  const aggregate = await tx.transaction.aggregate({
    where: { invoiceId, type: { not: "INVOICE_PAYMENT" } },
    _sum: { convertedAmount: true },
  });

  const total = money(aggregate._sum.convertedAmount ?? 0);

  const removed = await tx.invoice.deleteMany({
    where: { id: invoiceId, status: { not: "PAID" }, transactions: { none: {} } },
  });

  if (removed.count > 0) {
    return total;
  }

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
  /** Lançamentos da fatura, sem a transação de pagamento. */
  itemCount: number;
}

/**
 * Recorte dos lançamentos que a fatura mostra.
 *
 * O mesmo de {@link listInvoiceItems}, e não por acaso: sem ele, uma fatura de
 * uma compra passava a dizer "2 itens" depois de paga, porque o próprio
 * pagamento entrava na conta.
 */
const INVOICE_ITEMS_WHERE = { type: { not: "INVOICE_PAYMENT" } } as const;

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
    include: { _count: { select: { transactions: { where: INVOICE_ITEMS_WHERE } } } },
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
  /** Preenchido quando o lançamento pertence a uma dívida. */
  debtId: string | null;
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
  return (await listItemsByInvoice(userId, [invoiceId])).get(invoiceId) ?? [];
}

/**
 * Os lançamentos de várias faturas em duas consultas, e não duas por fatura.
 *
 * A tela de um cartão renderiza todas as faturas do histórico; chamar
 * `listInvoiceItems` num laço disparava `2 × nº de faturas` consultas
 * concorrentes contra um pool de dez.
 */
export async function listItemsByInvoice(
  userId: string,
  invoiceIds: string[],
): Promise<Map<string, InvoiceItem[]>> {
  const byInvoice = new Map<string, InvoiceItem[]>();

  if (invoiceIds.length === 0) {
    return byInvoice;
  }

  const items = await prisma.transaction.findMany({
    where: { userId, invoiceId: { in: invoiceIds }, ...INVOICE_ITEMS_WHERE },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { category: { select: { name: true, color: true } } },
  });

  const totalByAnchor = await groupTotals(
    userId,
    items.map((item) => item.parentInstallmentId ?? item.id),
  );

  for (const item of items) {
    const anchorId = item.parentInstallmentId ?? item.id;
    const bucket = byInvoice.get(item.invoiceId!) ?? [];

    bucket.push({
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
      debtId: item.debtId,
      anchorId,
      groupTotal: totalByAnchor.get(anchorId) ?? item.amount.toNumber(),
      fromRecurring: item.recurringExpenseId !== null,
    });

    byInvoice.set(item.invoiceId!, bucket);
  }

  return byInvoice;
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
