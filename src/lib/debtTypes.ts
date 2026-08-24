/**
 * Rótulos e cores de dívidas.
 *
 * Módulo sem nenhum import, como `@/lib/limits`: entra no bundle do cliente e
 * não pode arrastar o runtime do Prisma junto. Os códigos espelham os enums
 * `DebtType` e `DebtStatus` do schema, e `debtTypes.test.ts` verifica que a
 * correspondência não se desfez.
 */

export const DEBT_TYPE_CODES = ["LENT", "BORROWED"] as const;

export type DebtTypeCode = (typeof DEBT_TYPE_CODES)[number];

export const DEBT_TYPE_LABELS: Record<DebtTypeCode, string> = {
  LENT: "Emprestei",
  BORROWED: "Peguei emprestado",
};

/** Como a posição aparece em relatórios: dinheiro a receber ou a pagar. */
export const DEBT_TYPE_POSITION: Record<DebtTypeCode, string> = {
  LENT: "A receber",
  BORROWED: "A pagar",
};

/** Rótulo da movimentação que abate a dívida, do ponto de vista do usuário. */
export const DEBT_SETTLEMENT_LABELS: Record<DebtTypeCode, string> = {
  LENT: "Registrar recebimento",
  BORROWED: "Registrar pagamento",
};

export const DEBT_STATUS_CODES = ["PENDING", "PARTIALLY_PAID", "PAID"] as const;

export type DebtStatusCode = (typeof DEBT_STATUS_CODES)[number];

export const DEBT_STATUS_LABELS: Record<DebtStatusCode, string> = {
  PENDING: "Em aberto",
  PARTIALLY_PAID: "Parcial",
  PAID: "Quitada",
};

export const DEBT_STATUS_COLORS: Record<DebtStatusCode, string> = {
  PENDING: "orange",
  PARTIALLY_PAID: "blue",
  PAID: "teal",
};

/** Pronto para o prop `data` de um `Select` do Mantine. */
export const DEBT_TYPE_OPTIONS = DEBT_TYPE_CODES.map((code) => ({
  value: code,
  label: DEBT_TYPE_LABELS[code],
}));
