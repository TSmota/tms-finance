import type { Transaction } from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { getExchangeRate, FX_RATE_SCALE } from "@/lib/fxService";
import { convertMoney, toStorage } from "@/lib/money";
import { parseCalendarDate } from "@/lib/dates";
import { splitInstallments } from "@/lib/installments";
import { consecutiveCompetencies, invoiceCompetencyFor } from "@/lib/invoiceCycle";
import { recalcInvoiceTotals, resolveInvoice } from "@/lib/invoices";
import { requireCreditCard } from "@/lib/creditCards";
import { assertCategoryOwned } from "@/lib/ownership";
import type { CardPurchaseInput } from "@/lib/validations";

/**
 * Compras no cartão de crédito, à vista e parceladas.
 *
 * Nada aqui toca `currentBalance`: compra no cartão acumula na fatura. O
 * dinheiro só sai da conta quando a fatura é paga, em `@/lib/invoicePayments`.
 */

/**
 * Folga para a transação de uma compra parcelada.
 *
 * O default do Prisma é 5s, e uma compra no teto de `MAX_INSTALLMENTS` faz
 * algumas centenas de idas ao banco. Estourar daria `P2028` com todas as
 * faturas travadas até lá.
 */
const INSTALLMENT_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

/**
 * Registra a compra, distribuindo as parcelas em faturas consecutivas.
 *
 * A divisão acontece sobre o valor na moeda do lançamento e cada parcela é
 * convertida pela mesma taxa, o que mantém `amount × exchangeRate =
 * convertedAmount` verdadeiro em cada linha. Em compra estrangeira, a soma dos
 * convertidos pode diferir do total convertido em um centavo.
 *
 * Todas as parcelas ficam com a data da compra: é o `invoiceId` que determina a
 * qual mês cada uma pertence.
 */
export async function createCardPurchase(
  userId: string,
  input: CardPurchaseInput,
): Promise<Transaction[]> {
  const card = await requireCreditCard(userId, input.creditCardId);
  await assertCategoryOwned(userId, input.categoryId);

  const date = parseCalendarDate(input.date);

  const rate = await getExchangeRate({
    from: input.currency,
    to: card.currency,
    date,
    manualRate: input.manualFxRate,
  });
  const exchangeRate = rate.toFixed(FX_RATE_SCALE);

  // Recusa parcelamento inviável antes de abrir a transação, para não deixar
  // faturas vazias criadas por nada.
  const parts = splitInstallments(input.amount, input.installments);
  const competencies = consecutiveCompetencies(
    invoiceCompetencyFor(card, date),
    input.installments,
  );

  return prisma.$transaction(async (tx) => {
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
          type: "EXPENSE",
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

    // Um recalculo por fatura no fim, não um por parcela: as competências são
    // distintas, e `recalcInvoiceTotals` mantém a ordem crescente que evita
    // deadlock.
    await recalcInvoiceTotals(tx, touched);

    return created;
  }, INSTALLMENT_TX_OPTIONS);
}

/**
 * Substitui uma compra do cartão pelos novos dados, incluindo o valor real.
 *
 * A operação é sobre o **grupo**, nunca sobre uma parcela isolada: mexer numa
 * parcela sozinha quebraria a igualdade entre a soma das parcelas e o total.
 * Editar a 2/3 edita a compra toda.
 *
 * Apaga o grupo e recria em vez de casar parcela por parcela, porque o número
 * de parcelas, a data e o cartão podem mudar, e cada uma dessas mudanças
 * redistribui as parcelas por outras faturas. Os ids das linhas mudam, e nada
 * os referencia de fora.
 *
 * Fatura paga é intocável: o dinheiro já saiu pelo total antigo. Para corrigir,
 * desfaça o pagamento primeiro.
 */
export async function updateCardPurchase(
  userId: string,
  transactionId: string,
  input: CardPurchaseInput,
): Promise<Transaction[]> {
  const target = await prisma.transaction.findFirst({
    where: { id: transactionId, userId, creditCardId: { not: null } },
    select: { id: true, parentInstallmentId: true },
  });

  if (!target) {
    throw new NotFoundError("Lançamento não encontrado");
  }

  const anchorId = target.parentInstallmentId ?? target.id;

  const group = await prisma.transaction.findMany({
    where: { userId, OR: [{ id: anchorId }, { parentInstallmentId: anchorId }] },
    select: {
      id: true,
      recurringExpenseId: true,
      invoiceId: true,
      invoice: { select: { status: true } },
    },
  });

  if (group.some((row) => row.invoice?.status === "PAID")) {
    throw new InvalidOperationError(
      "Esta compra está em uma fatura paga. Desfaça o pagamento antes de editar.",
    );
  }

  const card = await requireCreditCard(userId, input.creditCardId);
  await assertCategoryOwned(userId, input.categoryId);

  const date = parseCalendarDate(input.date);

  // Preserva o vínculo com a recorrência: é o que mantém a linha reconhecível
  // como aquela cobrança, e não como uma compra manual.
  const recurringExpenseId =
    group.find((row) => row.recurringExpenseId !== null)?.recurringExpenseId ?? null;

  if (recurringExpenseId !== null) {
    await assertNoRecurringCollision(recurringExpenseId, date, group.map((row) => row.id));
  }

  const rate = await getExchangeRate({
    from: input.currency,
    to: card.currency,
    date,
    manualRate: input.manualFxRate,
  });
  const exchangeRate = rate.toFixed(FX_RATE_SCALE);

  const parts = splitInstallments(input.amount, input.installments);
  const competencies = consecutiveCompetencies(
    invoiceCompetencyFor(card, date),
    input.installments,
  );

  const previousInvoiceIds = group
    .map((row) => row.invoiceId)
    .filter((id): id is string => id !== null);

  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: group.map((row) => row.id) } } });

    const created: Transaction[] = [];
    const touched = new Set(previousInvoiceIds);
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
          type: "EXPENSE",
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
          installmentNumber: index + 1,
          totalInstallments: input.installments,
          parentInstallmentId,
          // Só a âncora herda a recorrência: as parcelas seguintes carregam a
          // mesma data, e o índice único `(recurring_expense_id, date)` as
          // recusaria.
          recurringExpenseId: index === 0 ? recurringExpenseId : null,
        },
      });

      parentInstallmentId ??= installment.id;
      created.push(installment);
      touched.add(invoice.id);
    }

    await recalcInvoiceTotals(tx, touched);

    return created;
  }, INSTALLMENT_TX_OPTIONS);
}

/**
 * Recusa mover uma ocorrência de recorrente para uma data que já tem outra.
 *
 * O índice único `(recurring_expense_id, date)` levantaria erro de constraint,
 * que aborta a transação e chegaria ao usuário como falha genérica.
 */
async function assertNoRecurringCollision(
  recurringExpenseId: string,
  date: Date,
  groupIds: string[],
): Promise<void> {
  const conflicting = await prisma.transaction.count({
    where: { recurringExpenseId, date, id: { notIn: groupIds } },
  });

  if (conflicting > 0) {
    throw new InvalidOperationError(
      "Já existe uma cobrança desta recorrência nesta data",
    );
  }
}

/**
 * Remove uma compra do cartão inteira, com todas as suas parcelas.
 *
 * Apagar apenas uma parcela deixaria a compra incoerente, então a operação é
 * sempre sobre o grupo: a parcela informada, sua âncora e todas as irmãs.
 *
 * Fatura paga é intocável, pela mesma razão de {@link updateCardPurchase}.
 */
export async function deleteCardPurchase(userId: string, transactionId: string): Promise<void> {
  const target = await prisma.transaction.findFirst({
    where: { id: transactionId, userId, creditCardId: { not: null } },
    select: { id: true, parentInstallmentId: true },
  });

  if (!target) {
    throw new NotFoundError("Lançamento não encontrado");
  }

  const anchorId = target.parentInstallmentId ?? target.id;

  // O dinheiro já saiu pelo total antigo: apagar as parcelas deixaria
  // `total_amount` menor que o valor pago, com a fatura ainda `PAID`.
  const paidInstallments = await prisma.transaction.count({
    where: {
      userId,
      OR: [{ id: anchorId }, { parentInstallmentId: anchorId }],
      invoice: { status: "PAID" },
    },
  });

  if (paidInstallments > 0) {
    throw new InvalidOperationError(
      "Esta compra está em uma fatura paga. Desfaça o pagamento antes de remover.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const group = await tx.transaction.findMany({
      where: {
        userId,
        OR: [{ id: anchorId }, { parentInstallmentId: anchorId }],
      },
      select: { id: true, invoiceId: true },
    });

    await tx.transaction.deleteMany({ where: { id: { in: group.map((item) => item.id) } } });

    await recalcInvoiceTotals(
      tx,
      group.map((item) => item.invoiceId).filter((id): id is string => id !== null),
    );
  }, INSTALLMENT_TX_OPTIONS);
}
