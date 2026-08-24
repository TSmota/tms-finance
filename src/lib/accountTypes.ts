import type { AccountType } from "@prisma/client";

/**
 * Natureza das contas. Client-safe: só `import type` do Prisma.
 *
 * A correspondência com o enum do banco é verificada em `accountTypes.test.ts`.
 */
export const ACCOUNT_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: "CHECKING", label: "Conta corrente" },
  { value: "SAVINGS", label: "Poupança" },
  { value: "INVESTMENT", label: "Investimento" },
  { value: "CASH", label: "Dinheiro / carteira física" },
];

export const ACCOUNT_TYPE_LABELS = Object.fromEntries(
  ACCOUNT_TYPES.map((type) => [type.value, type.label]),
) as Record<AccountType, string>;

/** Códigos, na ordem de exibição. */
export const ACCOUNT_TYPE_CODES = ACCOUNT_TYPES.map((type) => type.value) as [
  AccountType,
  ...AccountType[],
];
