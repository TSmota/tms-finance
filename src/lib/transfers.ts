import type { Transfer } from "@prisma/client";
import { prisma } from "@/lib/db";
import { applyToBalance, type Tx } from "@/lib/accountBalance";
import { requireAccount } from "@/lib/ownership";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { isPositive, money, toStorage } from "@/lib/money";
import { parseCalendarDate } from "@/lib/dates";
import { transferSchema, type TransferInput } from "@/lib/validations";

async function prepare(userId: string, input: TransferInput): Promise<TransferInput & { currency: Transfer["currency"] }> {
  input = transferSchema.parse(input);
  const source = await requireAccount(userId, input.sourceAccountId);
  const destination = await requireAccount(userId, input.destinationAccountId);
  if (source.currency !== destination.currency) {
    throw new InvalidOperationError("Transferências exigem contas da mesma moeda");
  }
  if (!isPositive(toStorage(input.amount))) {
    throw new InvalidOperationError("O valor mínimo é um centavo");
  }
  return { ...input, currency: source.currency };
}

async function move(tx: Tx, row: Pick<Transfer, "sourceAccountId" | "destinationAccountId" | "amount">, reverse = false): Promise<void> {
  const amount = money(row.amount).times(reverse ? -1 : 1);
  const changes = [
    { id: row.sourceAccountId, delta: amount.negated() },
    { id: row.destinationAccountId, delta: amount },
  ].sort((a, b) => a.id.localeCompare(b.id));
  for (const change of changes) {
    await applyToBalance(tx, change.id, change.delta);
  }
}

async function lock(tx: Tx, userId: string, id: string): Promise<Transfer> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM finance.transfers WHERE id = ${id}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
  if (!rows.length) {
    throw new NotFoundError("Transferência não encontrada");
  }
  return tx.transfer.findUniqueOrThrow({ where: { id } });
}

export async function createTransfer(userId: string, input: TransferInput): Promise<Transfer> {
  const data = await prepare(userId, input);
  return prisma.$transaction(async (tx) => {
    const row = await tx.transfer.create({ data: { ...data, userId, amount: toStorage(data.amount), date: parseCalendarDate(data.date) } });
    await move(tx, row);
    return row;
  });
}

export async function updateTransfer(userId: string, id: string, input: TransferInput): Promise<Transfer> {
  const data = await prepare(userId, input);
  return prisma.$transaction(async (tx) => {
    const previous = await lock(tx, userId, id);
    // Trava todas as contas antes de estornar para manter uma ordem global.
    const ids = [...new Set([previous.sourceAccountId, previous.destinationAccountId, data.sourceAccountId, data.destinationAccountId])].sort();
    for (const accountId of ids) {
      await tx.$queryRaw`SELECT id FROM finance.financial_accounts WHERE id = ${accountId}::uuid FOR UPDATE`;
    }
    await move(tx, previous, true);
    const row = await tx.transfer.update({ where: { id }, data: { ...data, amount: toStorage(data.amount), date: parseCalendarDate(data.date) } });
    await move(tx, row);
    return row;
  });
}

export async function deleteTransfer(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await lock(tx, userId, id);
    await move(tx, row, true);
    await tx.transfer.delete({ where: { id } });
  });
}

export async function listTransfers(userId: string): Promise<Transfer[]> {
  return prisma.transfer.findMany({ where: { userId }, orderBy: [{ date: "desc" }, { id: "desc" }], take: 200 });
}
