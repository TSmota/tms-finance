import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireAccount } from "@/lib/ownership";
import { requireInvoice } from "@/lib/invoices";
import { requireDebt, prepareDebtSettlement } from "@/lib/debts";
import { prepareInvoicePayment } from "@/lib/invoicePayments";
import { InvalidOperationError } from "@/lib/errors";
import { money, toStorage } from "@/lib/money";
import { batchPaymentSchema, type BatchPaymentInput } from "@/lib/validations";
import type { Currency } from "@prisma/client";

export interface PayableItem {
  id: string; kind: "INVOICE" | "DEBT"; description: string; amount: string; currency: Currency;
}

export async function listPayables(userId: string): Promise<PayableItem[]> {
  const [invoices, debts] = await Promise.all([
    prisma.invoice.findMany({ where: { userId, status: { not: "PAID" }, totalAmount: { gt: 0 } }, include: { creditCard: { select: { name: true } } }, orderBy: { dueDate: "asc" } }),
    prisma.debt.findMany({ where: { userId, type: "BORROWED", remainingAmount: { gt: 0 } }, orderBy: { dueDate: "asc" } }),
  ]);
  return [
    ...invoices.map((row): PayableItem => ({ id: row.id, kind: "INVOICE", description: `${row.creditCard.name} — ${row.month}/${row.year}`, amount: toStorage(row.totalAmount), currency: row.currency })),
    ...debts.map((row): PayableItem => ({ id: row.id, kind: "DEBT", description: row.description, amount: toStorage(row.remainingAmount), currency: row.currency })),
  ];
}

/** Cada lote é indivisível. Repetir a chave devolve os mesmos IDs, inclusive após estorno. */
export async function payBatch(userId: string, input: BatchPaymentInput): Promise<string[]> {
  input = batchPaymentSchema.parse(input);
  const items = [...input.items].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  const fingerprint = createHash("sha256").update(JSON.stringify({ accountId: input.accountId, date: input.date, items })).digest("hex");
  const replay = await prisma.paymentBatch.findFirst({ where: { id: input.requestId, userId } });
  if (replay) {
    if (replay.fingerprint !== fingerprint) {
      throw new InvalidOperationError("Esta chave já foi usada por outro lote");
    }
    return replay.transactionIds;
  }
  const account = await requireAccount(userId, input.accountId);
  const prepared: { item: BatchPaymentInput["items"][number]; lockOrder: string; execute: Awaited<ReturnType<typeof prepareInvoicePayment>> }[] = [];
  try {
    for (const item of items) {
      const row = item.kind === "INVOICE" ? await requireInvoice(userId, item.id) : await requireDebt(userId, item.id);
      if (row.currency !== account.currency || ("type" in row && row.type !== "BORROWED")) {
        throw new InvalidOperationError("Selecione apenas faturas e dívidas a pagar na moeda da conta");
      }
      const execute = item.kind === "INVOICE"
        ? await prepareInvoicePayment(userId, item.id, { accountId: account.id, date: input.date })
        : await prepareDebtSettlement(userId, item.id, {
            accountId: account.id, date: input.date, amount: item.expectedAmount, currency: account.currency,
            categoryId: null, description: null,
          });
      const lockOrder = "year" in row
        ? `1:${row.year}:${String(row.month).padStart(2, "0")}:${row.id}`
        : `0:${row.id}`;
      prepared.push({ item, execute, lockOrder });
    }
  } catch (error) {
    // Um retry pode encontrar a fatura já paga porque o primeiro lote acabou
    // de confirmar enquanto este preparava as taxas fora da transação.
    const completed = await prisma.paymentBatch.findUnique({ where: { id: input.requestId } });
    if (completed?.userId === userId && completed.transactionIds.length > 0) {
      if (completed.fingerprint !== fingerprint) {
        throw new InvalidOperationError("Esta chave já foi usada por outro lote");
      }
      return completed.transactionIds;
    }
    throw error;
  }
  prepared.sort((a, b) => a.lockOrder.localeCompare(b.lockOrder));
  return prisma.$transaction(async (tx) => {
    await tx.paymentBatch.createMany({ data: [{ id: input.requestId, userId, fingerprint, transactionIds: [] }], skipDuplicates: true });
    await tx.$queryRaw`SELECT id FROM finance.payment_batches WHERE id = ${input.requestId}::uuid FOR UPDATE`;
    const batch = await tx.paymentBatch.findUniqueOrThrow({ where: { id: input.requestId } });
    if (batch.userId !== userId || batch.fingerprint !== fingerprint) {
      throw new InvalidOperationError("Chave de lote indisponível; gere uma nova solicitação");
    }
    if (batch.transactionIds.length) {
      return batch.transactionIds;
    }
    // Dívidas antes de faturas, compatível com a edição de origens em cartão.
    for (const { item } of prepared) {
      if (item.kind === "DEBT") {
        await tx.$queryRaw`SELECT id FROM finance.debts WHERE id = ${item.id}::uuid FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM finance.invoices WHERE id = ${item.id}::uuid FOR UPDATE`;
      }
    }
    const ids: string[] = [];
    for (const { item, execute } of prepared) {
      const current = item.kind === "DEBT"
        ? (await tx.debt.findUniqueOrThrow({ where: { id: item.id } })).remainingAmount
        : (await tx.invoice.findUniqueOrThrow({ where: { id: item.id } })).totalAmount;
      if (!money(current).equals(item.expectedAmount)) {
        throw new InvalidOperationError("Um valor mudou. Atualize a seleção antes de pagar; nenhum item foi pago.");
      }
      ids.push((await execute(tx)).id);
    }
    await tx.paymentBatch.update({ where: { id: batch.id }, data: { transactionIds: ids } });
    return ids;
  }, { maxWait: 10_000, timeout: 30_000 });
}
