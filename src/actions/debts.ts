"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { debtSchema, debtSettlementSchema } from "@/lib/validations";
import * as service from "@/lib/debts";
import { parseId, runAction } from "./guard";
import type { ActionResult } from "./types";

/**
 * Toda dívida move dinheiro numa conta, então a revalidação alcança as telas de
 * saldo e de fluxo de caixa, não só as de dívida.
 */
function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/debts");
  revalidatePath("/dashboard/debts/[id]", "page");
  revalidatePath("/dashboard/people");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/transactions");
}

export async function createDebt(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = debtSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.createDebt(user.id, parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function updateDebt(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = debtSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.updateDebt(user.id, parseId(id), parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function deleteDebt(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => service.deleteDebt(user.id, parseId(id)));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function settleDebt(debtId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = debtSettlementSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.settleDebt(user.id, parseId(debtId), parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function deleteSettlement(transactionId: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => service.deleteSettlement(user.id, parseId(transactionId)));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}
