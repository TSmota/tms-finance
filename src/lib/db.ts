import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Pool explícito.
 *
 * Sem isto o `pg` cai no default de 10 conexões **por instância** e
 * `connectionTimeoutMillis` fica `undefined` — sem timeout, uma requisição que
 * não encontra conexão livre espera até o timeout da função em vez de falhar.
 * Em serverless o número de instâncias é que cresce, então o teto por instância
 * precisa ser pequeno; `DB_POOL_MAX` existe para o processo de longa duração,
 * onde o oposto vale.
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 5),
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
