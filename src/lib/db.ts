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
 *
 * O parse cai no default em vez de repassar o que veio do ambiente: o `pg`
 * resolve `max` com `||`, então `0` e `NaN` — o que `Number("")` e
 * `Number("dez")` produzem — viram silenciosamente os 10 que este bloco existe
 * para evitar.
 */
const poolMax = Number.parseInt(process.env.DB_POOL_MAX ?? "", 10);

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number.isInteger(poolMax) && poolMax > 0 ? poolMax : 5,
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
