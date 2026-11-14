"use server";

import { requireUser } from "@/lib/session";
import { agentTokenMintSchema } from "@/lib/validations";
import {
  mintAgentToken as mintAgentTokenService,
  revokeAgentToken as revokeAgentTokenService,
  type MintedAgentToken,
} from "@/lib/agentTokens";
import { DomainError } from "@/lib/errors";
import { parseId, revalidateDomain, runAction } from "./guard";
import type { ActionResult } from "./types";

export type MintTokenResult =
  | { ok: true; data: MintedAgentToken }
  | { ok: false; error: string };

/**
 * Emite um novo token de acesso MCP para agente.
 *
 * O token em claro é devolvido uma única vez nesta resposta para exibição na UI
 * e nunca poderá ser recuperado depois.
 */
export async function mintAgentToken(input: unknown): Promise<MintTokenResult> {
  const user = await requireUser();
  const parsed = agentTokenMintSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  try {
    const { label, scopes, expiresInDays } = parsed.data;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const minted = await mintAgentTokenService(user.id, {
      label,
      scopes,
      expiresAt,
    });

    revalidateDomain("agents");

    return { ok: true, data: minted };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, error: error.message };
    }

    console.error("Erro inesperado ao emitir token de agente:", error);
    return { ok: false, error: "Não foi possível emitir o token de agente." };
  }
}

/**
 * Revoga um token de acesso MCP pelo seu identificador.
 */
export async function revokeAgentToken(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const result = await runAction(async () => {
    await revokeAgentTokenService(user.id, parseId(id));
  });

  if (result.ok) {
    revalidateDomain("agents");
  }

  return result;
}
