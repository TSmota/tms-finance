"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { categorySchema } from "@/lib/validations";
import * as service from "@/lib/categories";
import { parseId, runAction } from "./guard";
import type { ActionResult } from "./types";

const AFFECTED_PATHS = ["/dashboard", "/dashboard/categories", "/dashboard/transactions"];

function revalidateAll() {
  for (const path of AFFECTED_PATHS) {
    revalidatePath(path);
  }
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
