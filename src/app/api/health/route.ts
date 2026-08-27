import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

/**
 * Distingue "app fora" de "banco fora".
 *
 * Sem o `SELECT 1` o monitoramento só saberia que a rota respondeu — e um app
 * de pé com o Postgres inacessível responde 200 em toda rota estática enquanto
 * nenhuma tela do produto carrega.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({ status: "ok", database: "ok" });
  } catch (error) {
    console.error("Health check falhou:", error);

    return NextResponse.json({ status: "degraded", database: "down" }, { status: 503 });
  }
}
