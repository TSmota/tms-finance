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
    ignores: ["src/lib/**/*.test.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "error",
    },
  },
]);

export default eslintConfig;
