"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { transactionSchema } from "@/lib/validations";
import * as service from "@/lib/transactions";
import { parseId, runAction } from "./guard";
import type { ActionResult } from "./types";

/**
 * Casca fina: autentica, valida, delega ao serviço e revalida. Toda a regra de
 * negócio (câmbio, saldo, atomicidade) vive em `@/lib/transactions`.
 */

const AFFECTED_PATHS = ["/dashboard", "/dashboard/transactions", "/dashboard/accounts"];

function revalidateAll() {
  for (const path of AFFECTED_PATHS) {
    revalidatePath(path);
  }
}

export async function createTransaction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = transactionSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.createTransaction(user.id, parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function updateTransaction(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = transactionSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() =>
    service.updateTransaction(user.id, parseId(id), parsed.data),
  );

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => service.deleteTransaction(user.id, parseId(id)));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}
