import { timingSafeEqual } from "node:crypto";

/**
 * Portão das rotas de cron.
 *
 * Elas escrevem no banco de todos os usuários e não têm sessão: o segredo é a
 * única autenticação. A comparação é em tempo constante — um `===` sobre string
 * vaza o prefixo correto pelo tempo de resposta.
 *
 * Sem `CRON_SECRET` configurado a rota recusa, em vez de liberar: um deploy que
 * esqueceu a variável precisa falhar barulhento, não ficar aberto.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  const header = request.headers.get("authorization");
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");

  return received.length === expected.length && timingSafeEqual(received, expected);
}
