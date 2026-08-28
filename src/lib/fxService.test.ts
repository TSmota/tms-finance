import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FX_RATE_SCALE,
  FxUnavailableError,
  getExchangeRate,
  resolveRatesToBase,
} from "./fxService";
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

describe("getExchangeRate — atalhos que evitam a rede", () => {
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

  it("ignora a taxa manual quando origem e destino são a mesma moeda", async () => {
    // A taxa responde por um par; a amortização consulta dois.
    const spy = mockFetch(() => jsonResponse({}));

    await expect(
      storedRate({ from: "BRL", to: "BRL", manualRate: 2 }),
    ).resolves.toBe("1.0000");
    expect(spy).not.toHaveBeenCalled();
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

describe("getExchangeRate — consulta à API", () => {
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

describe("getExchangeRate — precisão da taxa", () => {
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

describe("getExchangeRate — falhas viram FxUnavailableError", () => {
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

/**
 * A suíte de integração substitui esta função por inteiro (`tests/setup-fx.ts`),
 * então é aqui — e só aqui — que a implementação de verdade é exercitada.
 */
describe("resolveRatesToBase", () => {
  it("dedup: uma consulta por moeda distinta, e nenhuma para a base", async () => {
    const spy = mockFetch((url) =>
      jsonResponse({ rates: { BRL: url.includes("base=USD") ? 5.4 : 6.1 } }),
    );

    const { rates, complete } = await resolveRatesToBase(
      ["USD", "USD", "EUR", "BRL"],
      "BRL",
    );

    expect(spy).toHaveBeenCalledTimes(2);
    expect(complete).toBe(true);
    expect(rates.get("BRL")?.toFixed(FX_RATE_SCALE)).toBe("1.0000");
    expect(rates.get("USD")?.toFixed(FX_RATE_SCALE)).toBe("5.4000");
    expect(rates.get("EUR")?.toFixed(FX_RATE_SCALE)).toBe("6.1000");
  });

  it("a moeda sem cotação fica de fora e marca o total como parcial", async () => {
    // Somar a moeda que faltou como se valesse 1 daria um número sem
    // significado; quem chama exclui a linha e avisa que o total está parcial.
    mockFetch((url) =>
      url.includes("base=USD") ? jsonResponse({ rates: { BRL: 5.4 } }) : jsonResponse({}, 503),
    );

    const { rates, complete } = await resolveRatesToBase(["USD", "EUR"], "BRL");

    expect(complete).toBe(false);
    expect(rates.has("USD")).toBe(true);
    expect(rates.has("EUR")).toBe(false);
  });

  it("sem data, pede a cotação mais recente", async () => {
    const spy = mockFetch(() => jsonResponse({ rates: { BRL: 5.4 } }));

    await resolveRatesToBase(["USD"], "BRL");

    expect(spy.mock.calls[0]?.[0]).toContain("/latest?");
  });

  it("com data, pede a cotação daquele dia", async () => {
    // É o que faz o relatório de um mês fechado parar de mudar de valor todo
    // dia. Saldo e projeção continuam sem data, porque perguntam sobre hoje.
    const spy = mockFetch(() => jsonResponse({ rates: { BRL: 5.1 } }));

    await resolveRatesToBase(["USD"], "BRL", parseCalendarDate("2026-01-31"));

    expect(spy.mock.calls[0]?.[0]).toContain("/2026-01-31?");
  });

  it("não consulta nada quando tudo já está na moeda base", async () => {
    const spy = mockFetch(() => jsonResponse({}));

    const { rates, complete } = await resolveRatesToBase(["BRL", "BRL"], "BRL");

    expect(spy).not.toHaveBeenCalled();
    expect(complete).toBe(true);
    expect(rates.size).toBe(1);
  });
});
