import { afterEach, describe, expect, it, vi } from "vitest";

import { FX_RATE_SCALE, FxUnavailableError, getExchangeRate } from "./fxService";
import { parseCalendarDate } from "./dates";
import { convertMoney, MONEY_SCALE } from "./money";

/**
 * A taxa como ela será gravada: string com as 4 casas de `exchange_rate`.
 *
 * Comparar o `Decimal` por igualdade de objeto não diria nada sobre a precisão,
 * que é justamente o que importa aqui.
 */
async function storedRate(params: Parameters<typeof getExchangeRate>[0]): Promise<string> {
  return (await getExchangeRate(params)).toFixed(FX_RATE_SCALE);
}

/** Substitui o `fetch` global; nenhum teste toca a rede. */
function mockFetch(implementation: (url: string) => Promise<Response> | Response) {
  const spy = vi.fn((url: string | URL | Request) => {
    return Promise.resolve(implementation(String(url)));
  });

  vi.stubGlobal("fetch", spy);

  return spy;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("atalhos que evitam a rede", () => {
  it("devolve 1 quando origem e destino são a mesma moeda", async () => {
    const spy = mockFetch(() => jsonResponse({}));

    await expect(storedRate({ from: "BRL", to: "BRL" })).resolves.toBe("1.0000");
    expect(spy).not.toHaveBeenCalled();
  });

  it("usa a taxa manual sem consultar a API", async () => {
    const spy = mockFetch(() => jsonResponse({}));

    await expect(
      storedRate({ from: "USD", to: "BRL", manualRate: 5.4 }),
    ).resolves.toBe("5.4000");
    expect(spy).not.toHaveBeenCalled();
  });

  it("dá precedência à taxa manual mesmo com moedas iguais", async () => {
    mockFetch(() => jsonResponse({}));

    await expect(
      storedRate({ from: "BRL", to: "BRL", manualRate: 2 }),
    ).resolves.toBe("2.0000");
  });

  it("ignora taxa manual inválida e vai à API", async () => {
    const spy = mockFetch(() => jsonResponse({ rates: { BRL: 5.4 } }));

    await expect(
      storedRate({ from: "USD", to: "BRL", manualRate: 0 }),
    ).resolves.toBe("5.4000");
    expect(spy).toHaveBeenCalledOnce();

    await expect(
      storedRate({ from: "USD", to: "BRL", manualRate: -1 }),
    ).resolves.toBe("5.4000");
  });
});

describe("consulta à API", () => {
  it("pede a cotação mais recente quando não há data", async () => {
    const spy = mockFetch(() => jsonResponse({ rates: { BRL: 5.4321 } }));

    await expect(storedRate({ from: "USD", to: "BRL" })).resolves.toBe("5.4321");
    expect(spy.mock.calls[0]?.[0]).toContain("/latest?base=USD&symbols=BRL");
  });

  it("pede a cotação histórica da data informada, em UTC", async () => {
    const spy = mockFetch(() => jsonResponse({ rates: { BRL: 5.1 } }));

    await getExchangeRate({
      from: "USD",
      to: "BRL",
      date: parseCalendarDate("2026-08-20"),
    });

    expect(spy.mock.calls[0]?.[0]).toContain("/2026-08-20?base=USD&symbols=BRL");
  });
});

describe("precisão da taxa", () => {
  it("arredonda a taxa manual às 4 casas da coluna antes de devolvê-la", async () => {
    // Devolver a taxa cheia gravaria `exchange_rate` arredondado e
    // `converted_amount` calculado com outro número: o invariante
    // `amount × exchangeRate = convertedAmount` ficaria falso no banco.
    await expect(
      storedRate({ from: "USD", to: "BRL", manualRate: 5.12345678 }),
    ).resolves.toBe("5.1235");
  });

  it("arredonda também a taxa vinda da API", async () => {
    mockFetch(() => jsonResponse({ rates: { BRL: 5.123456 } }));

    await expect(storedRate({ from: "USD", to: "BRL" })).resolves.toBe("5.1235");
  });

  it("mantém amount × exchangeRate = convertedAmount", async () => {
    const rate = await getExchangeRate({ from: "USD", to: "BRL", manualRate: 5.12345678 });

    expect(convertMoney(1000, rate).toFixed(MONEY_SCALE)).toBe("5123.50");
    expect(rate.toFixed(FX_RATE_SCALE)).toBe("5.1235");
  });
});

describe("falhas viram FxUnavailableError", () => {
  it("resposta HTTP de erro", async () => {
    mockFetch(() => jsonResponse({}, 500));

    await expect(getExchangeRate({ from: "USD", to: "BRL" })).rejects.toThrow(
      FxUnavailableError,
    );
  });

  it("rede fora", async () => {
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });

    await expect(getExchangeRate({ from: "USD", to: "BRL" })).rejects.toThrow(
      FxUnavailableError,
    );
  });

  it("timeout", async () => {
    mockFetch(() => {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    });

    await expect(getExchangeRate({ from: "USD", to: "BRL" })).rejects.toThrow(
      FxUnavailableError,
    );
  });

  it("JSON inválido", async () => {
    mockFetch(() => new Response("não é json", { status: 200 }));

    await expect(getExchangeRate({ from: "USD", to: "BRL" })).rejects.toThrow(
      FxUnavailableError,
    );
  });

  it("resposta sem a moeda pedida", async () => {
    mockFetch(() => jsonResponse({ rates: { EUR: 0.9 } }));

    await expect(getExchangeRate({ from: "USD", to: "BRL" })).rejects.toThrow(
      /Sem cotação disponível para USD->BRL/,
    );
  });

  it("taxa zero, negativa ou não numérica", async () => {
    mockFetch(() => jsonResponse({ rates: { BRL: 0 } }));
    await expect(getExchangeRate({ from: "USD", to: "BRL" })).rejects.toThrow(
      FxUnavailableError,
    );

    mockFetch(() => jsonResponse({ rates: { BRL: -5 } }));
    await expect(getExchangeRate({ from: "USD", to: "BRL" })).rejects.toThrow(
      FxUnavailableError,
    );

    mockFetch(() => jsonResponse({ rates: { BRL: "5.4" } }));
    await expect(getExchangeRate({ from: "USD", to: "BRL" })).rejects.toThrow(
      FxUnavailableError,
    );
  });

  it("nunca devolve uma taxa inventada em caso de falha", async () => {
    // Uma taxa silenciosa de 1 gravaria convertedAmount errado no banco.
    mockFetch(() => jsonResponse({}, 503));

    await expect(getExchangeRate({ from: "USD", to: "BRL" })).rejects.toThrow();
  });
});
