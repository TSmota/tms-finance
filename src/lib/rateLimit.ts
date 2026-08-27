import { prisma } from "@/lib/db";

/**
 * Janela deslizante contada em SQL, compartilhada por login, cadastro e agente.
 *
 * **Por que no Postgres e não em memória:** o Fluid Compute reusa instâncias
 * mas não garante que duas chamadas caiam na mesma. Um bucket em processo
 * contaria cada instância separadamente e o limite real seria N vezes o
 * configurado — pior que não ter limite, porque parece ter.
 *
 * **Por que a linha entra antes da contagem:** contar e só então registrar
 * deixa uma janela em que N requisições simultâneas leem todas o mesmo total
 * antigo e passam juntas. Inserindo primeiro, cada requisição enxerga ao menos
 * a própria linha, e o excedente fica limitado ao que estiver realmente em voo.
 */

export interface RateLimitPolicy {
  /** Balde, gravado em `rate_limit_hits.scope`. */
  scope: string;
  /** Tentativas permitidas na janela, incluindo a que está sendo avaliada. */
  limit: number;
  windowMs: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Tentativas na janela, já contando esta. */
  used: number;
  limit: number;
}

const MINUTE = 60_000;

/**
 * Dois baldes no login porque eles protegem coisas diferentes: o de e-mail
 * cobre a conta alvo mesmo quando o atacante gira de IP, e o de IP cobre a
 * varredura de muitas contas a partir de uma origem só.
 */
export const LOGIN_BY_EMAIL: RateLimitPolicy = {
  scope: "login:email",
  limit: 10,
  windowMs: 15 * MINUTE,
};

export const LOGIN_BY_IP: RateLimitPolicy = {
  scope: "login:ip",
  limit: 30,
  windowMs: 15 * MINUTE,
};

export const REGISTER_BY_IP: RateLimitPolicy = {
  scope: "register:ip",
  limit: 5,
  windowMs: 60 * MINUTE,
};

/** Teto de `rate_limit_hits.key`. */
const KEY_MAX_LENGTH = 320;

/**
 * Registra a tentativa e devolve o veredito da janela.
 *
 * `now` é parâmetro com default para que o teste fixe o relógio: um teste que
 * dependa do relógio real quebra sozinho.
 */
export async function consumeRateLimit(
  policy: RateLimitPolicy,
  key: string,
  now: Date = new Date(),
): Promise<RateLimitVerdict> {
  const subject = key.trim().slice(0, KEY_MAX_LENGTH);
  const windowStart = new Date(now.getTime() - policy.windowMs);

  await prisma.rateLimitHit.create({
    data: { scope: policy.scope, key: subject, createdAt: now },
  });

  // Poda e contagem na mesma ida ao banco. O `DELETE` só alcança o que já saiu
  // da janela, então não interfere no total que o `SELECT` apura.
  const rows = await prisma.$queryRaw<{ used: number }[]>`
    WITH pruned AS (
      DELETE FROM finance.rate_limit_hits
      WHERE scope = ${policy.scope} AND key = ${subject} AND created_at <= ${windowStart}
    )
    SELECT count(*)::int AS used
    FROM finance.rate_limit_hits
    WHERE scope = ${policy.scope} AND key = ${subject} AND created_at > ${windowStart}
  `;

  const used = rows[0]?.used ?? policy.limit + 1;

  return { allowed: used <= policy.limit, used, limit: policy.limit };
}

/**
 * IP do cliente, ou `null` quando a origem não é identificável.
 *
 * `null` faz o chamador **pular** o balde por IP em vez de agrupar todos os
 * desconhecidos numa chave só, que transformaria um proxy sem cabeçalho em
 * negação de serviço para quem estiver atrás dele.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headers.get("x-real-ip")?.trim();

  return candidate ? candidate.slice(0, KEY_MAX_LENGTH) : null;
}
