"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { categorySchema } from "@/lib/validations";
import type { ActionResult } from "./types";

export type CategoryActionResult = ActionResult;

/**
 * Creates a new category for the authenticated user.
 * 
 * @param input The input data for the new category.
 * @returns The result of the category creation action.
 */
export async function createCategory(input: unknown): Promise<CategoryActionResult> {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Entrada inválida",
    };
  }

  await prisma.category.create({
    data: { ...parsed.data, userId: user.id },
  });

  revalidatePath("/dashboard/monthly-costs");
  revalidatePath("/dashboard/recurring");

  return { ok: true };
}

/**
 * Deletes an existing category for the authenticated user.
 * 
 * @param id The ID of the category to delete.
 * @returns The result of the category deletion action.
 */
export async function deleteCategory(id: string): Promise<CategoryActionResult> {
  const user = await requireUser();
  const { count } = await prisma.category.deleteMany({
    where: { id, userId: user.id },
  });

  if (count === 0) {
    return {
      ok: false,
      error: "Categoria não encontrada",
    };
  }

  revalidatePath("/dashboard/monthly-costs");
  revalidatePath("/dashboard/recurring");
  
  return { ok: true };
}
