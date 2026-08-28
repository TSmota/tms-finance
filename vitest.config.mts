import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";

/**
 * Variáveis do banco de teste, lidas de `.env.test` sem poluir o process.env
 * deste processo (`processEnv: {}`). São injetadas apenas no project de
 * integração.
 */
const testEnv = loadEnv({ path: ".env.test", processEnv: {}, quiet: true }).parsed ?? {};

const dbForbidden = fileURLToPath(new URL("./tests/support/db-forbidden.ts", import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          // Resolve o alias `@/*` do tsconfig.json nativamente (dispensa vite-tsconfig-paths).
          tsconfigPaths: true,
          // A separação entre os dois níveis não pode depender só do `include`
          // acima: aqui `@/lib/db` recusa em voz alta, com a mensagem dizendo
          // para onde mover o teste. Ver tests/support/db-forbidden.ts.
          alias: [{ find: /^@\/lib\/db$/, replacement: dbForbidden }],
        },
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
