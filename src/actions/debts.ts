"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { debtSchema, debtPaymentSchema } from "@/lib/validations";
import { FxUnavailableError, getExchangeRate } from "@/lib/fxService";
import { toNumber } from "@/lib/balance";
import { ActionResult } from "./types";

export type DebtsActionResult = ActionResult & {
  /** Indicates whether a manual foreign exchange rate is required */
  needsManualFxRate?: boolean;
}

/**
 * Creates a new debt for the authenticated user.
 * 
 * @param input The input data for the new debt.
 * @returns The result of the debt creation action.
 */
export async function createDebt(input: unknown): Promise<DebtsActionResult> {
  const user = await requireUser();
  const parsed = debtSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Entrada inválida",
    };
  }

  const data = parsed.data;
  await prisma.debt.create({
    data: {
      debtorName: data.debtorName,
      description: data.description || null,
      totalAmount: data.totalAmount.toFixed(2),
      currency: data.currency,
      dueDate: data.dueDate || null,
      status: "PENDING",
      userId: user.id,
    },
  });

  revalidatePath("/dashboard/debts");

  return { ok: true };
}

/**
 * Adds a payment to an existing debt for the authenticated user.
 * 
 * @param input The input data for the new debt payment.
 * @returns The result of the debt payment action.
 */
export async function addDebtPayment(input: unknown): Promise<DebtsActionResult> {
  const user = await requireUser();
  const parsed = debtPaymentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Entrada inválida",
    };
  }

  const data = parsed.data;

  const debt = await prisma.debt.findFirst({
    where: { id: data.debtId, userId: user.id },
  });

  if (!debt) {
    return {
      ok: false,
      error: "Dívida não encontrada",
    };
  }

  let fxRate = 1;

  try {
    fxRate = await getExchangeRate({
      from: debt.currency,
      to: user.preferredCurrency,
      date: data.paymentDate,
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

  await prisma.$transaction(async (tx) => {
    const { _sum } = await tx.debtPayment.aggregate({
      where: { debtId: debt.id },
      _sum: { amount: true },
    });

    const paidSoFar = toNumber(_sum.amount ?? 0);
    const newTotalPaid = paidSoFar + data.amount;
    const total = toNumber(debt.totalAmount);

    const status =
      newTotalPaid >= total ? "PAID" : newTotalPaid > 0 ? "PARTIAL" : "PENDING";

    await tx.debtPayment.create({
      data: {
        amount: data.amount.toFixed(2),
        paymentDate: data.paymentDate,
        fxRateAtCreation: fxRate.toString(),
        debtId: debt.id,
      },
    });

    await tx.debt.update({
      where: { id: debt.id },
      data: { status },
    });
  });

  revalidatePath("/dashboard/debts");

  return { ok: true };
}

/**
 * Deletes an existing debt for the authenticated user.
 * 
 * @param id The ID of the debt to delete.
 * @returns The result of the debt deletion action.
 */
export async function deleteDebt(id: string): Promise<DebtsActionResult> {
  const user = await requireUser();
  const { count } = await prisma.debt.deleteMany({
    where: { id, userId: user.id },
  });

  if (count === 0) {
    return { ok: false, error: "Dívida não encontrada" };
  }

  revalidatePath("/dashboard/debts");

  return { ok: true };
}
