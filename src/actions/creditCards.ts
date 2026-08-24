"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { creditCardSchema } from "@/lib/validations";
import * as service from "@/lib/creditCards";
import { parseId, runAction } from "./guard";
import type { ActionResult } from "./types";

const AFFECTED_PATHS = ["/dashboard", "/dashboard/cards"];

function revalidateAll() {
  for (const path of AFFECTED_PATHS) {
    revalidatePath(path);
  }
}

export async function createCreditCard(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = creditCardSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.createCreditCard(user.id, parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function updateCreditCard(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = creditCardSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() =>
    service.updateCreditCard(user.id, parseId(id), parsed.data),
  );

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function deleteCreditCard(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => service.deleteCreditCard(user.id, parseId(id)));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}
