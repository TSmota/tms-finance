import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  clientIp,
  consumeRateLimit,
  LOGIN_BY_EMAIL,
  LOGIN_BY_IP,
  type RateLimitPolicy,
} from "@/lib/rateLimit";

/**
 * Janela deslizante contada no Postgres.
 *
 * O ponto que justifica a tabela própria é a ordem: a tentativa é gravada
 * **antes** da contagem. Contando primeiro, N requisições simultâneas leem
 * todas o mesmo total antigo e passam juntas — que é exatamente o que uma
 * ferramenta de força bruta faz.
 */

const policy: RateLimitPolicy = {
  scope: "test:window",
  limit: 3,
  windowMs: 60_000,
};

describe("consumeRateLimit", () => {
  it("conta a própria tentativa e nega ao passar do limite", async () => {
    const now = new Date("2026-08-26T12:00:00Z");

    expect(await consumeRateLimit(policy, "alvo", now)).toMatchObject({
      allowed: true,
      used: 1,
    });
    expect(await consumeRateLimit(policy, "alvo", now)).toMatchObject({
      allowed: true,
      used: 2,
    });
    expect(await consumeRateLimit(policy, "alvo", now)).toMatchObject({
      allowed: true,
      used: 3,
    });
    expect(await consumeRateLimit(policy, "alvo", now)).toMatchObject({
      allowed: false,
      used: 4,
      limit: 3,
    });
  });

  it("desliza: o que saiu da janela não conta mais, e some da tabela", async () => {
    const antes = new Date("2026-08-26T12:00:00Z");
    const depois = new Date("2026-08-26T12:05:00Z");

    await consumeRateLimit(policy, "alvo", antes);
    await consumeRateLimit(policy, "alvo", antes);

    expect(await consumeRateLimit(policy, "alvo", depois)).toMatchObject({
      allowed: true,
      used: 1,
    });

    // Poda junto com a contagem: sem isso a tabela cresce para sempre.
    const rows = await prisma.rateLimitHit.count({ where: { scope: policy.scope } });

    expect(rows).toBe(1);
  });

  it("separa baldes e sujeitos: um não gasta a cota do outro", async () => {
    const now = new Date("2026-08-26T12:00:00Z");

    await consumeRateLimit(LOGIN_BY_EMAIL, "alvo@exemplo.com", now);
    await consumeRateLimit(LOGIN_BY_EMAIL, "alvo@exemplo.com", now);

    expect(await consumeRateLimit(LOGIN_BY_EMAIL, "outro@exemplo.com", now)).toMatchObject({
      used: 1,
    });
    expect(await consumeRateLimit(LOGIN_BY_IP, "alvo@exemplo.com", now)).toMatchObject({
      used: 1,
    });
  });

  it("não deixa duas tentativas simultâneas ocuparem a mesma vaga", async () => {
    const single: RateLimitPolicy = { scope: "test:race", limit: 1, windowMs: 60_000 };

    const verdicts = await Promise.all([
      consumeRateLimit(single, "alvo"),
      consumeRateLimit(single, "alvo"),
    ]);

    // Com a contagem antes da gravação as duas veriam zero e passariam. Não é
    // "exatamente uma": se as duas gravarem antes de qualquer contagem, as duas
    // enxergam duas e caem juntas — apertado a mais, nunca a menos.
    expect(verdicts.filter((verdict) => verdict.allowed).length).toBeLessThanOrEqual(1);
  });
});

describe("clientIp", () => {
  it("usa o primeiro endereço de x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" });

    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("devolve null sem cabeçalho, para o chamador pular o balde por IP", () => {
    // Agrupar todos os desconhecidos numa chave só transformaria um proxy sem
    // cabeçalho em negação de serviço para quem estiver atrás dele.
    expect(clientIp(new Headers())).toBeNull();
  });
});
