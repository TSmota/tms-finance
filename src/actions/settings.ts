"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { baseCurrencySchema } from "@/lib/validations";
import * as service from "@/lib/settings";
import { runAction } from "./guard";
import type { ActionResult } from "./types";

/**
 * A moeda base é lida por toda agregação, então a troca invalida **todas** as
 * telas — não uma lista de caminhos afetados como nas outras actions. Daí o
 * `"layout"`, que revalida a subárvore inteira de `/dashboard`.
 */
function revalidateAll() {
  revalidatePath("/dashboard", "layout");
}

export async function updateBaseCurrency(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = baseCurrencySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.updateBaseCurrency(user.id, parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}
