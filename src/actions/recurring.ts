"use server";

import { requireUser } from "@/lib/session";
import { confirmOccurrenceSchema, recurringExpenseSchema } from "@/lib/validations";
import * as service from "@/lib/recurring";
import { parseFlag, parseId, revalidateDomain, runAction } from "./guard";
import type { ActionResult } from "./types";

/**
 * Recorrentes e confirmação de pendências.
 *
 * A materialização saiu do carregamento das páginas: quem a dispara é o cron
 * diário e as escritas daqui. Materializar na escrita é o que faz a ocorrência
 * da recorrência recém-criada aparecer sem esperar o cron.
 */
function revalidateAll() {
  revalidateDomain("recurring");
}

export async function createRecurringExpense(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = recurringExpenseSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.createRecurringExpense(user.id, parsed.data));

  if (result.ok) {
    await materializeQuietly(user.id);
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
    await materializeQuietly(user.id);
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
    await materializeQuietly(user.id);
    revalidateAll();
  }

  return result;
}

/**
 * A escrita já aconteceu quando isto roda: a geração falhar não pode desfazer
 * o `{ ok: true }` da action. O cron tenta de novo.
 */
async function materializeQuietly(userId: string): Promise<void> {
  try {
    await service.materializeDue(userId);
  } catch (error) {
    console.error("Falha ao materializar recorrentes após escrita:", error);
  }
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
