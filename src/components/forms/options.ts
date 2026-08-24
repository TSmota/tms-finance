import type { Currency } from "@prisma/client";

/** Opção simples de `Select` do Mantine. */
export interface Option {
  value: string;
  label: string;
}

/**
 * Opção que carrega a moeda nativa do destino — conta ou cartão —, para que o
 * formulário já sugira a moeda certa ao trocar a seleção.
 */
export interface AccountOption extends Option {
  currency: Currency;
}
