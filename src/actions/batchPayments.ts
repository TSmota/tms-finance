"use server";
import { requireUser } from "@/lib/session";
import { batchPaymentSchema } from "@/lib/validations";
import * as service from "@/lib/batchPayments";
import { revalidateDomain, runAction } from "./guard";
import type { ActionResult } from "./types";

export async function payBatch(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = batchPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }
  const result = await runAction(() => service.payBatch(user.id, parsed.data));
  if (result.ok) {
    revalidateDomain("roadmap");
  }
  return result;
}
