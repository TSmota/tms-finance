import { vi } from "vitest";

/**
 * Câmbio determinístico para toda a suíte de integração.
 *
 * As taxas passam por `toStoredRate` da implementação real: sem arredondar às 4
 * casas da coluna como a produção, um teste com taxa de 6 casas passaria aqui e
 * divergiria no banco.
 *
 * Mockado globalmente para garantir que nenhum teste alcance a API do
 * Frankfurter. `resolveRatesToBase` também é substituída porque, em ESM, a
 * chamada interna do módulo a `getExchangeRate` não passa pelo mock e a versão
 * real ainda tentaria a rede.
 *
 * O estado fica num objeto de módulo comum, e não em `vi.hoisted`, que não pode
 * ser exportado. A factory do `vi.mock` é lazy, então o objeto já existe quando
 * ela roda.
 */
const fx = {
  /** Cotações no formato `"USD->BRL"`. */
  rates: new Map<string, number>(),
  /** Quando falso, toda consulta falha — simula a API fora do ar. */
  available: true,
};

/** Define as cotações do teste, substituindo as anteriores. */
export function setRates(rates: Record<string, number>): void {
  fx.rates.clear();

  for (const [pair, rate] of Object.entries(rates)) {
    fx.rates.set(pair, rate);
  }
}

/** Simula indisponibilidade do serviço de câmbio. */
export function setFxAvailable(available: boolean): void {
  fx.available = available;
}

vi.mock("@/lib/fxService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fxService")>();

  return {
    ...actual,

    getExchangeRate: vi.fn(
      async (params: {
        from: string;
        to: string;
        date?: Date;
        manualRate?: number | null;
      }): Promise<import("@/lib/fxService").FxRate> => {
        if (params.manualRate && params.manualRate > 0) {
          return actual.toStoredRate(params.manualRate);
        }

        if (params.from === params.to) {
          return actual.toStoredRate(1);
        }

        if (!fx.available) {
          throw new actual.FxUnavailableError();
        }

        const rate = fx.rates.get(`${params.from}->${params.to}`);

        if (rate === undefined) {
          throw new actual.FxUnavailableError(
            `Cotação ${params.from}->${params.to} não configurada no teste`,
          );
        }

        return actual.toStoredRate(rate);
      },
    ),

    resolveRatesToBase: vi.fn(async (currencies: string[], base: string) => {
      const rates = new Map<string, import("@/lib/fxService").FxRate>([
        [base, actual.toStoredRate(1)],
      ]);
      let complete = true;

      for (const currency of new Set(currencies)) {
        if (currency === base) {
          continue;
        }

        const rate = fx.available ? fx.rates.get(`${currency}->${base}`) : undefined;

        if (rate === undefined) {
          complete = false;
        } else {
          rates.set(currency, actual.toStoredRate(rate));
        }
      }

      return { rates, complete };
    }),
  };
});
