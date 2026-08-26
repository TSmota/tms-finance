"use server";

import { requireUser } from "@/lib/session";
import { baseCurrencySchema } from "@/lib/validations";
import * as service from "@/lib/settings";
import { revalidateDomain, runAction } from "./guard";
import type { ActionResult } from "./types";

/**
 * A moeda base é lida por toda agregação, então a troca invalida **todas** as
 * telas — não uma lista de caminhos afetados como nas outras actions. Daí o
 * `"layout"` da entrada `settings` da tabela, que revalida a subárvore inteira
 * de `/dashboard`.
 */
function revalidateAll() {
  revalidateDomain("settings");
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
