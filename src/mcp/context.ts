import type { Currency } from "@prisma/client";

import { isCurrencyCode } from "@/lib/currency";
import { parseAgentScopes, type AgentScope } from "@/lib/agentScopes";

/**
 * Identidade resolvida do agente, para o resto da casca MCP.
 *
 * O `AuthInfo` do `mcp-handler` carrega `extra` como `Record<string, unknown>`:
 * os campos são validados aqui em vez de assumidos, porque atravessam a
 * fronteira do pacote e voltam tipados como `unknown`.
 */

export interface AgentContext {
  userId: string;
  tokenId: string;
  scopes: AgentScope[];
  /** Moeda de referência dos relatórios. */
  baseCurrency: Currency;
}

/** O id precisa ser UUID. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AuthInfoLike {
  clientId?: unknown;
  scopes?: unknown;
  extra?: Record<string, unknown>;
}

/**
 * Constrói o contexto a partir do `AuthInfo`, ou `null` se algo não confere.
 *
 * `null` e não exceção: o chamador transforma isso num erro estruturado de
 * ferramenta. Uma exceção aqui viraria erro interno de protocolo, que esconde
 * a causa do agente e do log.
 */
export function agentContextFrom(authInfo: AuthInfoLike | undefined): AgentContext | null {
  if (!authInfo) {
    return null;
  }

  const tokenId = authInfo.clientId;
  const userId = authInfo.extra?.userId;

  if (typeof tokenId !== "string" || typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
    return null;
  }

  const rawScopes = Array.isArray(authInfo.scopes) ? authInfo.scopes : [];
  const scopes = parseAgentScopes(rawScopes.filter((s): s is string => typeof s === "string"));

  const rawCurrency = authInfo.extra?.baseCurrency;

  return {
    userId,
    tokenId,
    scopes,
    // Sem cotação declarada, BRL — o mesmo default do schema e do JWT.
    baseCurrency: isCurrencyCode(rawCurrency) ? rawCurrency : "BRL",
  };
}
