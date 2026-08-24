import { z } from "zod";

import { DomainError, NotFoundError } from "@/lib/errors";
import { FxUnavailableError } from "@/lib/fxService";
import type { ActionResult } from "./types";

/**
 * Fronteira única entre serviços e UI.
 *
 * Os serviços de `src/lib/` lançam erros de domínio; as actions precisam
 * devolver `ActionResult`. Concentrar a tradução aqui evita repetir o mesmo
 * try/catch em toda action e garante que nenhuma delas vaze mensagem interna:
 * erro desconhecido é registrado no servidor e sai como texto genérico.
 */
export async function runAction(operation: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await operation();

    return { ok: true };
  } catch (error) {
    if (error instanceof FxUnavailableError) {
      return {
        ok: false,
        needsManualFxRate: true,
        error: "Taxa de câmbio indisponível. Informe manualmente.",
      };
    }

    if (error instanceof DomainError) {
      return { ok: false, error: error.message };
    }

    // `redirect()` do Next sinaliza por exceção — precisa continuar subindo.
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("Erro inesperado em server action:", error);

    return { ok: false, error: "Ocorreu um erro inesperado. Tente novamente." };
  }
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

const idSchema = z.uuid();

/**
 * Valida um identificador vindo do cliente.
 *
 * Server Action é endpoint HTTP público: o tipo declarado na assinatura é
 * apagado na compilação e não garante nada em runtime. Sem esta checagem, um id
 * malformado chega ao Prisma e estoura `P2023`, que `runAction` classifica como
 * erro inesperado — o usuário lê "ocorreu um erro inesperado" em vez de "não
 * encontrado".
 *
 * Lança {@link NotFoundError}, que é o que um id inválido significa de fora.
 * Chame de dentro do callback de {@link runAction}.
 */
export function parseId(value: unknown): string {
  const parsed = idSchema.safeParse(value);

  if (!parsed.success) {
    throw new NotFoundError("Identificador inválido");
  }

  return parsed.data;
}

/** Valida um booleano vindo do cliente, pela mesma razão de {@link parseId}. */
export function parseFlag(value: unknown): boolean {
  const parsed = z.boolean().safeParse(value);

  if (!parsed.success) {
    throw new NotFoundError("Valor inválido");
  }

  return parsed.data;
}
