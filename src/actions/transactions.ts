"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { transactionSchema } from "@/lib/validations";
import { FxUnavailableError, getExchangeRate } from "@/lib/fxService";
import { ActionResult } from "./types";

export type TransactionActionResult = ActionResult & {
  /** Indicates whether a manual foreign exchange rate is required */
  needsManualFxRate?: boolean;
}

/**
 * Creates a new financial transaction for the authenticated user, converting the amount to the user's preferred currency if necessary.
 * 
 * @param input The input data for the new transaction.
 * @returns The result of the transaction creation action.
 */
export async function createTransaction(input: unknown): Promise<TransactionActionResult> {
  const user = await requireUser();
  const parsed = transactionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Entrada inválida",
    };
  }

  const data = parsed.data;
  const account = await prisma.financialAccount.findFirst({
    where: { id: data.accountId, userId: user.id },
  });
  if (!account) {
    return { ok: false, error: "Conta não encontrada" };
  }

  // Convert the account currency to the user's preferred currency.
  let fxRate = 1;

  try {
    fxRate = await getExchangeRate({
      from: account.currency,
      to: user.preferredCurrency,
      date: data.date,
      manualRate: data.manualFxRate,
    });
  } catch (err) {
    if (err instanceof FxUnavailableError) {
      return {
        ok: false,
        needsManualFxRate: true,
        error: "Taxa de câmbio indisponível. Informe manualmente.",
      };
    }
    throw err;
  }

  await prisma.transaction.create({
    data: {
      amount: data.amount.toFixed(2),
      type: data.type,
      date: data.date,
      description: data.description,
      fxRateAtCreation: fxRate.toString(),
      accountId: data.accountId,
      categoryId: data.categoryId || null,
      userId: user.id,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/monthly-costs");
  revalidatePath("/dashboard/accounts");

  return { ok: true };
}

/**
 * Deletes an existing financial transaction for the authenticated user.
 * 
 * @param id The ID of the transaction to delete.
 * @returns The result of the transaction deletion action.
 */
export async function deleteTransaction(id: string): Promise<TransactionActionResult> {
  const user = await requireUser();
  const { count } = await prisma.transaction.deleteMany({
    where: { id, userId: user.id },
  });

  if (count === 0) {
    return { ok: false, error: "Transação não encontrada" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/monthly-costs");
  revalidatePath("/dashboard/accounts");

  return { ok: true };
}
