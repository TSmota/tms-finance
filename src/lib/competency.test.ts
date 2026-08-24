import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveCompetency } from "./competency";

/** O mês corrente é o fallback; fixamos o relógio para poder afirmar sobre ele. */
function withClock(iso: string, run: () => void) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  run();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("competência da query string", () => {
  it("aceita YYYY-MM", () => {
    expect(resolveCompetency("2026-08")).toEqual({ year: 2026, month: 8 });
    expect(resolveCompetency("2026-01")).toEqual({ year: 2026, month: 1 });
    expect(resolveCompetency("2026-12")).toEqual({ year: 2026, month: 12 });
  });

  it("cai no mês corrente quando o parâmetro está ausente ou é inválido", () => {
    withClock("2026-08-21T12:00:00", () => {
      const current = { year: 2026, month: 8 };

      expect(resolveCompetency(undefined)).toEqual(current);
      expect(resolveCompetency("")).toEqual(current);
      // Mês fora de 1-12, formato errado e injeção não passam.
      expect(resolveCompetency("2026-13")).toEqual(current);
      expect(resolveCompetency("2026-00")).toEqual(current);
      expect(resolveCompetency("2026-8")).toEqual(current);
      expect(resolveCompetency("agosto")).toEqual(current);
      expect(resolveCompetency("2026-08-15")).toEqual(current);
    });
  });
});
