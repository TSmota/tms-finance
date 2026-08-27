import { consumeRateLimit, type RateLimitPolicy, type RateLimitVerdict } from "@/lib/rateLimit";

/**
 * Janela deslizante por token, sobre `rate_limit_hits`.
 *
 * Tabela própria e não `agent_audit_log`, que já é escrito em toda chamada: a
 * auditoria só grava **depois** de a ferramenta rodar, então N chamadas
 * simultâneas contariam todas zero e passariam juntas. `@/lib/rateLimit` insere
 * a tentativa antes de contar, e por isso cada chamada enxerga ao menos a
 * própria linha.
 *
 * **O que isto protege:** loop desgovernado do agente. Não é medida
 * anti-fraude — o token já é a autenticação. Por isso o default é generoso.
 */

const DEFAULT_LIMIT_PER_MINUTE = 60;

export function agentRateLimitPerMinute(): number {
  const raw = process.env.AGENT_RATE_LIMIT_PER_MINUTE;

  if (!raw) {
    return DEFAULT_LIMIT_PER_MINUTE;
  }

  const parsed = Number.parseInt(raw, 10);

  // Valor inválido cai no default em vez de virar `NaN` e desligar o limite por
  // acidente: uma comparação com `NaN` é sempre falsa.
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT_PER_MINUTE;
}

// Montada a cada chamada, e não no import: o limite vem do ambiente, e um
// módulo avaliado uma vez congelaria o valor do primeiro carregamento.
function agentPolicy(): RateLimitPolicy {
  return { scope: "agent", limit: agentRateLimitPerMinute(), windowMs: 60_000 };
}

export type { RateLimitVerdict };

/** Registra a chamada do token e diz se ela cabe na janela do último minuto. */
export async function checkAgentRateLimit(
  tokenId: string,
  now: Date = new Date(),
): Promise<RateLimitVerdict> {
  return consumeRateLimit(agentPolicy(), tokenId, now);
}
