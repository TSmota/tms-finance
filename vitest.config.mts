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
    /**
     * Visibilidade, não portão: o gate canônico segue sendo typecheck, lint,
     * test e build.
     *
     * O `include` é o que faz o relatório valer: no Vitest 4 ele já relata todo
     * arquivo que casa com o padrão, tenha ou não sido carregado por um teste —
     * é assim que o módulo que ninguém exercita aparece como 0% em vez de
     * simplesmente não aparecer.
     *
     * O escopo são as três camadas de regra. Componentes ficam de fora por
     * decisão registrada na seção Testes: não há teste de UI funcional, e
     * incluí-los só afundaria o número sem dizer nada.
     */
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/mcp/**/*.ts", "src/actions/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "html"],
    },
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
