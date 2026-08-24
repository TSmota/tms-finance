"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { invoicePaymentSchema } from "@/lib/validations";
import * as service from "@/lib/invoicePayments";
import { parseId, runAction } from "./guard";
import type { ActionResult } from "./types";

function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cards");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard/cards/[id]", "page");
}

export async function payInvoice(invoiceId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = invoicePaymentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() =>
    service.payInvoice(user.id, parseId(invoiceId), parsed.data),
  );

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function undoInvoicePayment(invoiceId: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() =>
    service.undoInvoicePayment(user.id, parseId(invoiceId)),
  );

  if (result.ok) {
    revalidateAll();
  }

  return result;
}
