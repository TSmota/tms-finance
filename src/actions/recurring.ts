"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { confirmOccurrenceSchema, recurringExpenseSchema } from "@/lib/validations";
import * as service from "@/lib/recurring";
import { parseFlag, parseId, runAction } from "./guard";
import type { ActionResult } from "./types";

/**
 * Recorrentes e confirmação de pendências.
 *
 * A materialização das ocorrências não tem action: acontece no carregamento das
 * páginas mensais, que é o gatilho da geração lazy.
 */
function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/recurring");
  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/cards");
  revalidatePath("/dashboard/cards/[id]", "page");
}

export async function createRecurringExpense(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = recurringExpenseSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.createRecurringExpense(user.id, parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function updateRecurringExpense(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = recurringExpenseSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() =>
    service.updateRecurringExpense(user.id, parseId(id), parsed.data),
  );

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function deleteRecurringExpense(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => service.deleteRecurringExpense(user.id, parseId(id)));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function setRecurringActive(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() =>
    service.setRecurringActive(user.id, parseId(id), parseFlag(active)),
  );

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function confirmPendingTransaction(
  transactionId: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = confirmOccurrenceSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() =>
    service.confirmPendingTransaction(user.id, parseId(transactionId), parsed.data),
  );

  if (result.ok) {
    revalidateAll();
  }

  return result;
}
