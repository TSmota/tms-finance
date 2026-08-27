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
export const CURRENCIES = ["BRL", "USD", "EUR", "GBP"] as const satisfies readonly Currency[];

/**
 * Apelido client-safe do enum do Prisma, e não `(typeof CURRENCIES)[number]`.
 *
 * Derivar da tupla os tornaria tipos distintos, e cada fronteira entre serviço
 * e componente precisaria de um `as` — no-op hoje, que acrescentar uma moeda
 * transformaria em silêncio em falha de runtime. Sendo o mesmo tipo, quem
 * diverge é `currency.test.ts`, antes do deploy.
 */
export type CurrencyCode = Currency;

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

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/** Cor padrão de categoria sem cor definida. */
export const DEFAULT_CATEGORY_COLOR = "#868e96";

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
