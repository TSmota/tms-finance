import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";

/**
 * Variáveis do banco de teste, lidas de `.env.test` sem poluir o process.env
 * deste processo (`processEnv: {}`). São injetadas apenas no project de
 * integração, para que nenhum teste unitário consiga tocar o banco por acidente.
 */
const testEnv = loadEnv({ path: ".env.test", processEnv: {}, quiet: true }).parsed ?? {};

export default defineConfig({
  test: {
    projects: [
      {
        // Resolve o alias `@/*` do tsconfig.json nativamente (dispensa vite-tsconfig-paths).
        resolve: { tsconfigPaths: true },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          env: testEnv,
          globalSetup: ["tests/global-setup.ts"],
          setupFiles: ["tests/setup-fx.ts", "tests/setup-db.ts"],
          // Um banco compartilhado + TRUNCATE por teste não tolera concorrência
          // entre arquivos: um truncaria os dados do outro no meio da execução.
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
