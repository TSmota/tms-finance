"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { recurringExpenseSchema } from "@/lib/validations";
import { ActionResult } from "./types";

export type RecurringActionResult = ActionResult;

/**
 * Creates a new recurring expense for the authenticated user.
 * 
 * @param input The input data for the new recurring expense.
 * @returns The result of the recurring expense creation action.
 */
export async function createRecurringExpense(input: unknown): Promise<RecurringActionResult> {
  const user = await requireUser();
  const parsed = recurringExpenseSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Entrada inválida",
    };
  }

  const data = parsed.data;
  await prisma.recurringExpense.create({
    data: {
      name: data.name,
      amount: data.amount.toFixed(2),
      currency: data.currency,
      interval: data.interval,
      nextDueDate: data.nextDueDate,
      active: data.active,
      categoryId: data.categoryId || null,
      userId: user.id,
    },
  });

  revalidatePath("/dashboard/recurring");

  return { ok: true };
}

/**
 * Toggles the active status of an existing recurring expense for the authenticated user.
 * 
 * @param id The ID of the recurring expense to toggle.
 * @returns The result of the toggle action.
 */
export async function toggleRecurringActive(id: string): Promise<RecurringActionResult> {
  const user = await requireUser();
  const item = await prisma.recurringExpense.findFirst({
    where: { id, userId: user.id },
  });

  if (!item) {
    return { ok: false, error: "Despesa recorrente não encontrada" };
  }

  await prisma.recurringExpense.updateMany({
    where: { id, userId: user.id },
    data: { active: !item.active },
  });

  revalidatePath("/dashboard/recurring");

  return { ok: true };
}

/**
 * Deletes an existing recurring expense for the authenticated user.
 * 
 * @param id The ID of the recurring expense to delete.
 * @returns The result of the delete action.
 */
export async function deleteRecurringExpense(id: string): Promise<RecurringActionResult> {
  const user = await requireUser();
  const { count } = await prisma.recurringExpense.deleteMany({
    where: { id, userId: user.id },
  });

  if (count === 0) {
    return { ok: false, error: "Despesa recorrente não encontrada" };
  }

  revalidatePath("/dashboard/recurring");
  
  return { ok: true };
}
