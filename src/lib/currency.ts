/**
 * Pure, client-safe currency helpers. Kept free of server-only imports
 * (Prisma, fx service) so they can be used inside client components.
 */

/**
 * Converts a value to a number, treating non-finite values as 0.
 */
export function toNumber(value: unknown): number {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

/**
 * Formats a numeric amount as a currency string using the specified currency code.
 * Falls back to a simple string format when the currency code is invalid.
 */
export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
