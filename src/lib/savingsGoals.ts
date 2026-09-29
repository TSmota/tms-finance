import type { SavingsGoal, SavingsEntry } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Tx } from "@/lib/accountBalance";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { money, toStorage } from "@/lib/money";
import { parseCalendarDate, toCalendarDate } from "@/lib/dates";
import { savingsGoalSchema, savingsEntrySchema, type SavingsGoalInput, type SavingsEntryInput } from "@/lib/validations";

async function lock(tx: Tx, userId: string, id: string): Promise<SavingsGoal> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM finance.savings_goals WHERE id = ${id}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
  if (!rows.length) {
    throw new NotFoundError("Meta não encontrada");
  }
  return tx.savingsGoal.findUniqueOrThrow({ where: { id } });
}

function validateTargetAmount(value: SavingsGoalInput["targetAmount"]): string {
  const targetAmount = toStorage(value);
  if (!money(targetAmount).greaterThan(0)) {
    throw new InvalidOperationError("O valor-alvo mínimo é um centavo");
  }
  return targetAmount;
}

export async function createSavingsGoal(userId: string, input: SavingsGoalInput): Promise<SavingsGoal> {
  const data = savingsGoalSchema.parse(input);
  const targetAmount = validateTargetAmount(data.targetAmount);
  return prisma.savingsGoal.create({ data: { ...data, userId, targetAmount, dueDate: data.dueDate ? parseCalendarDate(data.dueDate) : null } });
}

export async function updateSavingsGoal(userId: string, id: string, input: SavingsGoalInput): Promise<SavingsGoal> {
  const data = savingsGoalSchema.parse(input);
  const targetAmount = validateTargetAmount(data.targetAmount);
  return prisma.$transaction(async (tx) => {
    const current = await lock(tx, userId, id);
    if (current.currency !== data.currency) {
      throw new InvalidOperationError("A moeda da meta não pode ser alterada");
    }
    return tx.savingsGoal.update({ where: { id }, data: { ...data, targetAmount, dueDate: data.dueDate ? parseCalendarDate(data.dueDate) : null } });
  });
}

export async function addSavingsEntry(userId: string, id: string, input: SavingsEntryInput): Promise<SavingsEntry> {
  const data = savingsEntrySchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const goal = await lock(tx, userId, id);
    if (goal.paused) {
      throw new InvalidOperationError("Retome a meta antes de registrar movimentações");
    }
    const total = await tx.savingsEntry.aggregate({ where: { goalId: id }, _sum: { amount: true } });
    const value = money(toStorage(data.amount)).times(data.kind === "WITHDRAWAL" ? -1 : 1);
    if (value.isZero() || money(total._sum.amount ?? 0).plus(value).isNegative()) {
      throw new InvalidOperationError("A retirada não pode exceder o progresso e o valor mínimo é um centavo");
    }
    return tx.savingsEntry.create({ data: { goalId: id, amount: toStorage(value), date: parseCalendarDate(data.date), description: data.description } });
  });
}

export interface SavingsGoalView {
  id: string; name: string; currency: SavingsGoal["currency"]; targetAmount: string;
  progress: string; percentage: number; dueDate: string | null; paused: boolean;
  status: "PAUSED" | "COMPLETED" | "ACTIVE";
  entries: { id: string; amount: string; date: string; description: string }[];
}

export async function listSavingsGoals(userId: string): Promise<SavingsGoalView[]> {
  const goals = await prisma.savingsGoal.findMany({ where: { userId }, include: { entries: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] } }, orderBy: { createdAt: "desc" } });
  return goals.map((goal) => {
    const progress = goal.entries.reduce((sum, entry) => sum.plus(entry.amount), money(0));
    return {
      id: goal.id, name: goal.name, currency: goal.currency, targetAmount: toStorage(goal.targetAmount),
      progress: toStorage(progress), percentage: progress.div(goal.targetAmount).times(100).toNumber(),
      dueDate: goal.dueDate ? toCalendarDate(goal.dueDate) : null, paused: goal.paused,
      status: goal.paused ? "PAUSED" : progress.greaterThanOrEqualTo(goal.targetAmount) ? "COMPLETED" : "ACTIVE",
      entries: goal.entries.map((entry) => ({ id: entry.id, amount: toStorage(entry.amount), date: toCalendarDate(entry.date), description: entry.description })),
    };
  });
}
