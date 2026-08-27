import { Prisma } from "@prisma/client";

/**
 * Aritmética monetária em decimal exato.
 *
 * `number` não participa de operação monetária: `0.1 + 0.2 ===
 * 0.30000000000000004` em binário flutuante, e o erro acumula a cada soma.
 * `Prisma.Decimal` é o decimal.js que já vem com o `@prisma/client`, e o mesmo
 * tipo que o Prisma devolve ao ler colunas `DECIMAL`.
 *
 * Contrato do módulo:
 * - `number` só na **borda de entrada** (formulário) e na **borda de saída**
 *   (renderização). Nunca no meio.
 * - Toda escrita no banco passa por {@link toStorage}, que fixa 2 casas.
 *
 * Server-only: importa `@prisma/client`. Componentes client usam
 * `@/lib/currency`.
 */

/** Casas decimais de todo valor monetário do sistema (`DECIMAL(12,2)`). */
export const MONEY_SCALE = 2;

export type Money = Prisma.Decimal;

/** Valores aceitos na construção de um {@link Money}. */
export type MoneyInput = Prisma.Decimal.Value;

/** Constrói um valor monetário. Não arredonda — use {@link roundMoney}. */
export function money(value: MoneyInput): Money {
  return new Prisma.Decimal(value);
}

export const ZERO: Money = money(0);

/**
 * Arredonda para 2 casas com half-up (0,005 → 0,01), a convenção de moeda.
 * É o padrão do decimal.js, explicitado aqui para não depender de default.
 */
export function roundMoney(value: MoneyInput): Money {
  return money(value).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Serializa para escrita no banco: string com exatamente 2 casas.
 *
 * String, e não `number`, para que o valor não passe por float no caminho até
 * o Postgres.
 */
export function toStorage(value: MoneyInput): string {
  return roundMoney(value).toFixed(MONEY_SCALE);
}

/** Soma exata de uma lista, sem acumular erro. */
export function sumMoney(values: MoneyInput[]): Money {
  return values.reduce<Money>((total, value) => total.plus(value), ZERO);
}

/**
 * Aplica uma taxa de câmbio: `amount × rate`, arredondado a 2 casas.
 *
 * O resultado é o `convertedAmount` da transação — o valor na moeda da
 * conta/cartão, que é o que move saldo e fatura.
 */
export function convertMoney(amount: MoneyInput, rate: MoneyInput): Money {
  return roundMoney(money(amount).times(rate));
}

export function isPositive(value: MoneyInput): boolean {
  return money(value).greaterThan(0);
}

export function isZero(value: MoneyInput): boolean {
  return money(value).isZero();
}

/** `a` e `b` representam o mesmo valor monetário (após arredondar a 2 casas). */
export function moneyEquals(a: MoneyInput, b: MoneyInput): boolean {
  return roundMoney(a).equals(roundMoney(b));
}
