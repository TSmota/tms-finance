"use server";

import { requireUser } from "@/lib/session";
import { cardPurchaseSchema } from "@/lib/validations";
import * as service from "@/lib/cardPurchases";
import { parseId, revalidateDomain, runAction } from "./guard";
import type { ActionResult } from "./types";

function revalidateAll() {
  revalidateDomain("cardPurchases");
}

export async function createCardPurchase(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = cardPurchaseSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.createCardPurchase(user.id, parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function updateCardPurchase(
  transactionId: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = cardPurchaseSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() =>
    service.updateCardPurchase(user.id, parseId(transactionId), parsed.data),
  );

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function deleteCardPurchase(transactionId: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() =>
    service.deleteCardPurchase(user.id, parseId(transactionId)),
  );

  if (result.ok) {
    revalidateAll();
  }

  return result;
}
