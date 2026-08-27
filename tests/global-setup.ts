import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

/**
 * Roda uma vez antes da suíte de integração: garante o banco de teste com todas
 * as migrations aplicadas.
 *
 * `DATABASE_URL` vai explícita no ambiente do processo filho. O
 * `prisma.config.ts` faz `import "dotenv/config"`, que carrega o `.env` de
 * desenvolvimento, mas o dotenv não sobrescreve variável já definida — então o
 * banco de dev nunca é tocado.
 */
export default function setup() {
  const { parsed } = loadEnv({ path: ".env.test", processEnv: {}, quiet: true });
  const databaseUrl = parsed?.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL ausente em .env.test — os testes de integração precisam de um banco dedicado.");
  }

  if (!/tms_finance_test/.test(databaseUrl)) {
    throw new Error(
      `Recusando rodar: a DATABASE_URL de teste não aponta para tms_finance_test (${databaseUrl}). ` +
        "A suíte TRUNCA todas as tabelas a cada teste.",
    );
  }

  // `pipe` para não poluir a saída da suíte quando dá certo, mas o que o Prisma
  // escreveu entra na mensagem quando dá errado: sem isso a falha chega ao
  // runner como "Command failed", sem a causa.
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    const saida = `${stdout?.toString() ?? ""}${stderr?.toString() ?? ""}`.trim();

    throw new Error(`prisma migrate deploy falhou.${saida ? `\n\n${saida}` : ""}`);
  }
}
