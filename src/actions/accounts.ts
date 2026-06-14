"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { accountSchema } from "@/lib/validations";
import type { ActionResult } from "./types";

export type AccountActionResult = ActionResult;

/**
 * Creates a new financial account for the authenticated user.
 * 
 * @param input The input data for the new account.
 * @returns The result of the account creation action.
 */
export async function createAccount(input: unknown): Promise<AccountActionResult> {
  const user = await requireUser();
  const parsed = accountSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Entrada inválida",
    };
  }

  const { name, type, currency, initialBalance } = parsed.data;

  await prisma.financialAccount.create({
    data: {
      name,
      type,
      currency,
      initialBalance: initialBalance.toFixed(2),
      userId: user.id,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounts");

  return { ok: true };
}

/**
 * Updates an existing financial account for the authenticated user.
 * 
 * @param id The ID of the account to update.
 * @param input The updated account data.
 * @returns The result of the account update action.
 */
export async function updateAccount(id: string, input: unknown): Promise<AccountActionResult> {
  const user = await requireUser();
  const parsed = accountSchema.safeParse(input);

  if (!parsed.success) {
    return { 
      ok: false, 
      error: parsed.error.issues[0]?.message ?? "Entrada inválida",
    };
  }

  const { name, type, currency, initialBalance } = parsed.data;
  const { count } = await prisma.financialAccount.updateMany({
    where: { id, userId: user.id },
    data: { name, type, currency, initialBalance: initialBalance.toFixed(2) },
  });

  if (count === 0) {
    return { ok: false, error: "Conta não encontrada" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounts");
  return { ok: true };
}

/**
 * Deletes an existing financial account for the authenticated user.
 * 
 * @param id The ID of the account to delete.
 * @returns The result of the account deletion action.
 */
export async function deleteAccount(id: string): Promise<AccountActionResult> {
  const user = await requireUser();
  const { count } = await prisma.financialAccount.deleteMany({
    where: { id, userId: user.id },
  });

  if (count === 0) {
    return { ok: false, error: "Conta não encontrada" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounts");
  
  return { ok: true };
}
