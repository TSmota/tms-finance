"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import {
  describeDeletionImpact,
  DELETION_TARGETS,
  type DeletionImpact,
} from "@/lib/deletionImpact";
import { parseId } from "./guard";

const targetSchema = z.enum(DELETION_TARGETS);

type ImpactResult = { ok: true; impact: DeletionImpact } | { ok: false; error: string };

/**
 * Lê o impacto de uma remoção para o modal de confirmação.
 *
 * Não passa por `runAction`: o `ActionResult` só carrega `ok`, e aqui o dado é
 * a resposta inteira. Leitura pura — nada a revalidar.
 */
export async function getDeletionImpact(target: unknown, id: string): Promise<ImpactResult> {
  const user = await requireUser();
  const parsed = targetSchema.safeParse(target);

  if (!parsed.success) {
    return { ok: false, error: "Tipo de remoção desconhecido" };
  }

  try {
    return { ok: true, impact: await describeDeletionImpact(user.id, parsed.data, parseId(id)) };
  } catch {
    return { ok: false, error: "Não foi possível medir o impacto desta remoção" };
  }
}
