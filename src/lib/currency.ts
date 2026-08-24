import type { Currency } from "@prisma/client";

/**
 * Helpers de moeda seguros para componentes client.
 *
 * Só faz `import type` do `@prisma/client` — apagado na compilação, então nada
 * do runtime do Prisma vai para o bundle do navegador. Aritmética monetária
 * fica em `@/lib/money`, que é server-only.
 */

/**
 * Moedas suportadas. Fonte única da lista para `Select`s e schemas Zod.
 * A correspondência com o enum `Currency` do Prisma é verificada em
 * `currency.test.ts`.
 */
export const CURRENCIES = ["BRL", "USD", "EUR", "GBP"] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  BRL: "Real (R$)",
  USD: "Dólar (US$)",
  EUR: "Euro (€)",
  GBP: "Libra (£)",
};

/** Pronto para o prop `data` de um `Select` do Mantine. */
export const CURRENCY_OPTIONS = CURRENCIES.map((code) => ({
  value: code,
  label: CURRENCY_LABELS[code],
}));

/** Verdadeiro se `value` é um código de moeda suportado. */
export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/** Cor padrão de categoria sem cor definida. */
export const DEFAULT_CATEGORY_COLOR = "#868e96";

/**
 * Converte para `number`, tratando valores não finitos como 0.
 * Aceita o `Decimal` que o Prisma devolve, via `Number()`.
 */
export function toNumber(value: unknown): number {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

/**
 * Formata um valor como moeda em pt-BR. Cai para um formato simples se o
 * código de moeda for inválido.
 */
export function formatCurrency(amount: number, currency: Currency | string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
