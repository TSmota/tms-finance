/**
 * Foreign-exchange helpers backed by the free Frankfurter API (https://frankfurter.dev). 
 * No API key required. 
 * Supports historical rates by date. ECB data, so weekends/holidays resolve to the latest business day.
 */

const FX_BASE_URL = "https://api.frankfurter.dev/v1";

export class FxUnavailableError extends Error {
  constructor(message = "Exchange rate service is unavailable") {
    super(message);
    this.name = "FxUnavailableError";
  }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface GetFxRateParams {
  /** The currency to convert from */
  from: string;
  /** The currency to convert to */
  to: string;
  /** The date for which to fetch the exchange rate */
  date?: Date;
  /** A manually specified exchange rate */
  manualRate?: number | null;
}

/**
 * Fetches the exchange rate to convert 1 unit of `from` into `to`.
 * 
 * Throws {@link FxUnavailableError} when the service cannot be reached or the
 * rate is missing.
 */
export async function getExchangeRate(params: GetFxRateParams): Promise<number> {
  const { from, to, date, manualRate } = params;

  if (from === to) {
    return 1;
  }

  if (manualRate && manualRate > 0) {
    return manualRate;
  }

  const datePart = date ? formatDate(date) : "latest";
  const url = `${FX_BASE_URL}/${datePart}?base=${from}&symbols=${to}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      throw new FxUnavailableError(`FX API responded ${res.status}`);
    }

    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[to];

    if (typeof rate !== "number") {
      throw new FxUnavailableError(`No rate available for ${from}->${to}`);
    }

    return rate;
  } catch (err) {
    if (err instanceof FxUnavailableError) {
      throw err;
    }

    throw new FxUnavailableError();
  }
}
