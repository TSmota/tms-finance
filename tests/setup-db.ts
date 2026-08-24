import { afterAll, beforeEach } from "vitest";

import { prisma } from "@/lib/db";

/**
 * Isolamento entre testes: TRUNCATE em todas as tabelas do schema `finance`
 * antes de cada teste. Mais rápido e mais previsível que envolver cada teste
 * numa transação com rollback — que não funcionaria aqui, porque o código sob
 * teste usa `prisma.$transaction` internamente (transações aninhadas).
 *
 * A lista de tabelas é lida do catálogo uma única vez e memoizada: assim uma
 * tabela nova criada por migration entra no reset sem precisar editar isto.
 */
let cachedTables: string[] | null = null;

async function financeTables(): Promise<string[]> {
  if (cachedTables) {
    return cachedTables;
  }

  // `format('%I.%I')` devolve o identificador já quotado pelo próprio Postgres:
  // nada de nome de tabela concatenado à mão indo parar no `$executeRawUnsafe`.
  const rows = await prisma.$queryRaw<{ qualifiedName: string }[]>`
    SELECT format('%I.%I', schemaname, tablename) AS "qualifiedName"
    FROM pg_tables WHERE schemaname = 'finance'
  `;

  cachedTables = rows.map((row) => row.qualifiedName);

  if (cachedTables.length === 0) {
    throw new Error("Nenhuma tabela encontrada no schema `finance` — a migration rodou?");
  }

  return cachedTables;
}

export async function resetDb(): Promise<void> {
  const tables = await financeTables();

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});
