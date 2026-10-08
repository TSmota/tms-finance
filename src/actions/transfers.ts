"use server";
import { requireUser } from "@/lib/session";
import { transferSchema } from "@/lib/validations";
import * as service from "@/lib/transfers";
import { parseId, revalidateDomain, runAction } from "./guard";
import type { ActionResult } from "./types";

export async function createTransfer(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }
  const result = await runAction(() => service.createTransfer(user.id, parsed.data));
  if (result.ok) {
    revalidateDomain("roadmap");
  }
  return result;
}

export async function updateTransfer(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }
  const result = await runAction(() => service.updateTransfer(user.id, parseId(id), parsed.data));
  if (result.ok) {
    revalidateDomain("roadmap");
  }
  return result;
}

export async function deleteTransfer(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => service.deleteTransfer(user.id, parseId(id)));
  if (result.ok) {
    revalidateDomain("roadmap");
  }
  return result;
}
