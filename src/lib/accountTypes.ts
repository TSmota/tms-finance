export const ACCOUNT_TYPES: Array<{ value: string; label: string }> = [
  { value: "CHECKING", label: "Conta corrente" },
  { value: "SAVINGS", label: "Poupança" },
  { value: "INVESTMENT", label: "Investimento" },
  { value: "CASH", label: "Dinheiro" },
];

export const ACCOUNT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ACCOUNT_TYPES.map((type) => [type.value, type.label]),
);
