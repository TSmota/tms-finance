import { defineConfig, globalIgnores } from "eslint/config";
import stylistic from "@stylistic/eslint-plugin";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      curly: ["error", "all"],
      // Sem estas duas, o fixer do `curly` para em `if (x) {stmt;}` — ele insere as chaves e não reindenta.
      "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: false }],
      "@stylistic/indent": [
        "error",
        2,
        { SwitchCase: 1, offsetTernaryExpressions: true },
      ],
    },
  },
  {
    // Sem tipo explícito, trocar um `select` muda em silêncio o contrato que páginas e MCP consomem.
    files: ["src/lib/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "error",
    },
  },
  {
    // Último bloco, e por isso vence os anteriores: os testes unitários moram
    // dentro de `src`, então toda regra dirigida a uma pasta de `src` os pega
    // junto. Desligar aqui, de uma vez, evita repetir um `ignores` a cada regra
    // nova — que é o custo real de colocalizar o teste ao lado do módulo.
    files: ["**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
]);

export default eslintConfig;
