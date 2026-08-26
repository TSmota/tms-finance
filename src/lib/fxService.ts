import { Prisma } from "@prisma/client";
import type { Currency } from "@prisma/client";

import { toCalendarDate } from "@/lib/dates";

/**
 * Câmbio via API Frankfurter (https://frankfurter.dev) — dados do BCE, sem
 * chave de API. Suporta taxa histórica por data; como a série é de dias úteis,
 * fins de semana e feriados resolvem para o último dia útil anterior.
 */

const FX_BASE_URL = "https://api.frankfurter.dev/v1";

/** Casas decimais da coluna `exchange_rate` (`DECIMAL(10,4)`). */
export const FX_RATE_SCALE = 4;

/**
 * Uma taxa de câmbio, já na precisão em que será gravada.
 *
 * Decimal, e não `number`, pela mesma razão de `@/lib/money`: a taxa entra em
 * multiplicação monetária, e float ali reabre o erro de arredondamento.
 */
export type FxRate = Prisma.Decimal;

/**
 * Reduz a taxa à precisão da coluna `exchange_rate` **antes** de qualquer
 * conversão.
 *
 * Sem isto, o serviço gravaria `rate.toFixed(4)` mas calcularia o
 * `convertedAmount` com a taxa cheia, e `amount × exchangeRate =
 * convertedAmount` ficaria falso no banco: uma taxa manual de `5,12345678`
 * sobre R$ 1.000,00 diverge em 4 centavos.
 */
export function toStoredRate(rate: Prisma.Decimal.Value): FxRate {
  return new Prisma.Decimal(rate).toDecimalPlaces(
    FX_RATE_SCALE,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

export class FxUnavailableError extends Error {
  constructor(message = "Serviço de câmbio indisponível") {
    super(message);
    this.name = "FxUnavailableError";
  }
}

interface GetFxRateParams {
  from: Currency;
  to: Currency;
  /** Data da cotação. Ausente = cotação mais recente. */
  date?: Date;
  /** Taxa informada manualmente; tem precedência sobre a API. */
  manualRate?: number | null;
}

/**
 * Taxa para converter 1 unidade de `from` em `to`.
 *
 * Lança {@link FxUnavailableError} quando a API não responde ou não tem a
 * cotação pedida — nunca devolve uma taxa inventada, porque isso gravaria um
 * valor convertido errado no banco de forma silenciosa.
 */
export async function getExchangeRate(params: GetFxRateParams): Promise<FxRate> {
  const { from, to, date, manualRate } = params;

  // Antes da taxa manual: quem informa uma taxa responde por **um** par, e a
  // mesma operação pode consultar outro em que as moedas coincidem.
  if (from === to) {
    return toStoredRate(1);
  }

  if (manualRate && manualRate > 0) {
    return toStoredRate(manualRate);
  }

  const datePart = date ? toCalendarDate(date) : "latest";
  const url = `${FX_BASE_URL}/${datePart}?base=${from}&symbols=${to}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      throw new FxUnavailableError(`A API de câmbio respondeu ${res.status}`);
    }

    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[to];

    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      throw new FxUnavailableError(`Sem cotação disponível para ${from}->${to}`);
    }

    return toStoredRate(rate);
  } catch (error) {
    if (error instanceof FxUnavailableError) {
      throw error;
    }

    // Rede fora, timeout, JSON inválido: tudo colapsa no mesmo erro tratável.
    throw new FxUnavailableError();
  }
}

/**
 * Taxas de várias moedas para a moeda base, resolvidas em paralelo.
 *
 * Tolerante a falha: a moeda sem cotação não entra no mapa e `complete` vira
 * `false`. Quem chama exclui do total e sinaliza que ele está parcial — nunca
 * soma moedas diferentes como se fossem a mesma.
 *
 * Existe porque `convertedAmount` está na moeda da **conta**: somar contas de
 * moedas distintas exige esta segunda conversão.
 *
 * `date` ausente = cotação mais recente, e é o certo para saldo, patrimônio e
 * projeção, que são perguntas sobre o presente. Agregação de mês fechado passa
 * a data da competência: sem ela, o total de janeiro mudava todo dia.
 */
export async function resolveRatesToBase(
  currencies: Currency[],
  base: Currency,
  date?: Date,
): Promise<{ rates: Map<Currency, FxRate>; complete: boolean }> {
  const rates = new Map<Currency, FxRate>([[base, toStoredRate(1)]]);
  const foreign = [...new Set(currencies)].filter((currency) => currency !== base);

  const results = await Promise.all(
    foreign.map(async (currency) => {
      try {
        rates.set(currency, await getExchangeRate({ from: currency, to: base, date }));

        return true;
      } catch {
        return false;
      }
    }),
  );

  return { rates, complete: results.every(Boolean) };
}
