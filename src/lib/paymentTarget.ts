/**
 * Codificação do destino de pagamento num único valor de `Select`.
 *
 * Usado por gastos recorrentes e pela origem de uma dívida. O destino é um XOR:
 * conta bancária **ou** cartão. Dois campos separados convidariam a preencher os
 * dois e só descobrir o erro na submissão.
 *
 * Mora em `src/lib` sem `"use client"` porque o formulário é client e a página
 * que monta os valores iniciais é Server Component. No módulo client, chamá-las
 * do servidor levantaria em runtime "Attempted to call joinTarget() from the
 * server" — erro invisível ao build, ao typecheck e aos testes.
 */

import type { Option } from "@/lib/options";

export const TARGET_ACCOUNT_PREFIX = "account:";
export const TARGET_CARD_PREFIX = "card:";

/** Separa o destino escolhido nos dois campos que o serviço espera. */
export function splitTarget(target: string): {
  accountId: string | null;
  creditCardId: string | null;
} {
  if (target.startsWith(TARGET_ACCOUNT_PREFIX)) {
    return { accountId: target.slice(TARGET_ACCOUNT_PREFIX.length), creditCardId: null };
  }

  if (target.startsWith(TARGET_CARD_PREFIX)) {
    return { accountId: null, creditCardId: target.slice(TARGET_CARD_PREFIX.length) };
  }

  return { accountId: null, creditCardId: null };
}

/** Monta o valor do `Select` a partir do destino gravado. */
export function joinTarget(accountId: string | null, creditCardId: string | null): string {
  if (accountId) {
    return `${TARGET_ACCOUNT_PREFIX}${accountId}`;
  }
  if (creditCardId) {
    return `${TARGET_CARD_PREFIX}${creditCardId}`;
  }

  return "";
}

/** Destino sugerido quando não há origem gravada: a primeira conta, se houver. */
export function defaultAccountTarget(accounts: Option[]): string {
  return joinTarget(accounts[0]?.value ?? null, null);
}
