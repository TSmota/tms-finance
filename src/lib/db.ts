import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Pool explícito: sem ele o `pg` usa 10 conexões por instância e nenhum timeout
 * de aquisição. O guard existe porque `max` é resolvido com `||`, então `0` e
 * `NaN` reativam esses 10 em silêncio.
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
