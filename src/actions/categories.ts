"use server";

import { requireUser } from "@/lib/session";
import { categorySchema } from "@/lib/validations";
import * as service from "@/lib/categories";
import { parseId, revalidateDomain, runAction } from "./guard";
import type { ActionResult } from "./types";

function revalidateAll() {
  revalidateDomain("categories");
}

export async function createCategory(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.createCategory(user.id, parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function updateCategory(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.updateCategory(user.id, parseId(id), parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => service.deleteCategory(user.id, parseId(id)));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}
