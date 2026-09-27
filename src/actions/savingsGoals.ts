"use server";
import { requireUser } from "@/lib/session";
import { savingsEntrySchema, savingsGoalSchema } from "@/lib/validations";
import * as service from "@/lib/savingsGoals";
import { parseId, revalidateDomain, runAction } from "./guard";
import type { ActionResult } from "./types";

export async function createSavingsGoal(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = savingsGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }
  const result = await runAction(() => service.createSavingsGoal(user.id, parsed.data));
  if (result.ok) {
    revalidateDomain("roadmap");
  }
  return result;
}

export async function updateSavingsGoal(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = savingsGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }
  const result = await runAction(() => service.updateSavingsGoal(user.id, parseId(id), parsed.data));
  if (result.ok) {
    revalidateDomain("roadmap");
  }
  return result;
}

export async function addSavingsEntry(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = savingsEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }
  const result = await runAction(() => service.addSavingsEntry(user.id, parseId(id), parsed.data));
  if (result.ok) {
    revalidateDomain("roadmap");
  }
  return result;
}
