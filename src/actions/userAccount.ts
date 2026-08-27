"use server";

import { requireUser } from "@/lib/session";
import { passwordChangeSchema } from "@/lib/validations";
import * as service from "@/lib/userAccount";
import { runAction } from "./guard";
import type { ActionResult } from "./types";

export async function changePassword(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = passwordChangeSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  // Sem `revalidatePath`: nenhuma tela mostra a senha, e o que a troca invalida
  // é a sessão, não o cache de render.
  return runAction(() => service.changePassword(user.id, parsed.data));
}

type ExportResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Devolve o JSON inteiro; o download é montado no cliente, sem rota nova. */
export async function exportMyData(): Promise<ExportResult> {
  const user = await requireUser();

  try {
    return { ok: true, data: await service.exportUserData(user.id) };
  } catch (error) {
    console.error("Falha ao exportar dados do usuário:", error);

    return { ok: false, error: "Não foi possível gerar a exportação. Tente novamente." };
  }
}
