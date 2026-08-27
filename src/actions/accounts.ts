"use server";

import { requireUser } from "@/lib/session";
import { accountSchema } from "@/lib/validations";
import * as service from "@/lib/accounts";
import { parseId, revalidateDomain, runAction } from "./guard";
import type { ActionResult } from "./types";

function revalidateAll() {
  revalidateDomain("accounts");
}

export async function createAccount(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = accountSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.createAccount(user.id, parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function updateAccount(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = accountSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.updateAccount(user.id, parseId(id), parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => service.deleteAccount(user.id, parseId(id)));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}
