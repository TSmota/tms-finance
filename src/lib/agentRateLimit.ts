import { prisma } from "@/lib/db";

/**
 * Janela deslizante por token, contada em SQL sobre `agent_audit_log`.
 *
 * **Por que no Postgres e não em memória:** o Fluid Compute reusa instâncias
 * mas não garante que duas chamadas caiam na mesma. Um bucket em processo
 * contaria cada instância separadamente e o limite real seria N vezes o
 * configurado — pior que não ter limite, porque parece ter. A tabela de
 * auditoria já é escrita em toda chamada e já tem o índice
 * `(token_id, created_at)`, então a contagem é uma consulta indexada e nenhuma
 * infraestrutura nova entra (sem Redis).
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

export interface RateLimitVerdict {
  allowed: boolean;
  /** Chamadas já registradas na janela. */
  used: number;
  limit: number;
}

/**
 * Conta as chamadas do token no último minuto.
 *
 * `now` é parâmetro com default para que o teste fixe o relógio: um teste que
 * dependa do relógio real quebra sozinho.
 */
export async function checkAgentRateLimit(
  tokenId: string,
  now: Date = new Date(),
): Promise<RateLimitVerdict> {
  const limit = agentRateLimitPerMinute();
  const windowStart = new Date(now.getTime() - 60_000);

  const used = await prisma.agentAuditLog.count({
    where: { tokenId, createdAt: { gt: windowStart } },
  });

  return { allowed: used < limit, used, limit };
}
