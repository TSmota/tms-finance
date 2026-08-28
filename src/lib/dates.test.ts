import { describe, expect, it } from "vitest";

import { itAcrossTimeZones, setTimeZone } from "@tests/support/timeZones";

import {
  addMonths,
  competencyOf,
  currentCompetency,
  lastDayOfMonth,
  monthRange,
  parseCalendarDate,
  toCalendarDate,
  todayCalendarDate,
  utcDate,
  utcDateClamped,
} from "./dates";

/**
 * Toda data do domínio é uma data de calendário ancorada em meia-noite UTC.
 *
 * O que estes testes protegem: o dia certo sobreviver a mês curto, virada de
 * ano e dia que não existe no mês. A independência de fuso, que é o motivo de o
 * módulo existir, tem seu próprio `describe` no fim do arquivo.
 */

describe("utcDate", () => {
  it("ancora o dia em meia-noite UTC", () => {
    expect(utcDate(2026, 8, 20).toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("aceita mês 1 e mês 12 (fronteiras do índice 1-12)", () => {
    expect(utcDate(2026, 1, 1).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(utcDate(2026, 12, 31).toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});

describe("lastDayOfMonth", () => {
  it("resolve meses de 30 e 31 dias", () => {
    expect(lastDayOfMonth(2026, 1)).toBe(31);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
    expect(lastDayOfMonth(2026, 12)).toBe(31);
  });

  it("resolve fevereiro em ano comum e bissexto", () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2028, 2)).toBe(29);
    // 2100 não é bissexto: divisível por 100 e não por 400.
    expect(lastDayOfMonth(2100, 2)).toBe(28);
    expect(lastDayOfMonth(2000, 2)).toBe(29);
  });
});

describe("utcDateClamped", () => {
  it("limita o dia ao último dia do mês", () => {
    expect(toCalendarDate(utcDateClamped(2026, 2, 31))).toBe("2026-02-28");
    expect(toCalendarDate(utcDateClamped(2028, 2, 31))).toBe("2028-02-29");
    expect(toCalendarDate(utcDateClamped(2026, 4, 31))).toBe("2026-04-30");
  });

  it("não altera dias que existem no mês", () => {
    expect(toCalendarDate(utcDateClamped(2026, 8, 20))).toBe("2026-08-20");
    expect(toCalendarDate(utcDateClamped(2026, 1, 31))).toBe("2026-01-31");
  });

  it("difere de utcDate, que transborda", () => {
    // Documenta a diferença entre os dois: é por isso que existem separados.
    expect(toCalendarDate(utcDate(2026, 2, 31))).toBe("2026-03-03");
    expect(toCalendarDate(utcDateClamped(2026, 2, 31))).toBe("2026-02-28");
  });
});

describe("addMonths", () => {
  it("avança dentro do mesmo ano", () => {
    expect(addMonths(2026, 8, 2)).toEqual({ year: 2026, month: 10 });
  });

  it("vira o ano para frente", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 11, 3)).toEqual({ year: 2027, month: 2 });
  });

  it("vira o ano para trás", () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths(2026, 2, -14)).toEqual({ year: 2024, month: 12 });
  });

  it("é neutro com offset 0", () => {
    expect(addMonths(2026, 8, 0)).toEqual({ year: 2026, month: 8 });
  });

  it("avança 12 meses exatos", () => {
    expect(addMonths(2026, 8, 12)).toEqual({ year: 2027, month: 8 });
  });
});

describe("monthRange", () => {
  it("devolve intervalo semiaberto do mês", () => {
    const { start, end } = monthRange(2026, 8);

    expect(start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("vira o ano em dezembro", () => {
    const { start, end } = monthRange(2026, 12);

    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("exclui o primeiro instante do mês seguinte", () => {
    const { end } = monthRange(2026, 8);

    // Uma transação em 2026-08-31 entra; 2026-09-01 não.
    expect(utcDate(2026, 8, 31) < end).toBe(true);
    expect(utcDate(2026, 9, 1) < end).toBe(false);
  });
});

describe("parseCalendarDate", () => {
  it("converte YYYY-MM-DD em meia-noite UTC", () => {
    expect(parseCalendarDate("2026-08-20").toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("rejeita formato fora do padrão", () => {
    expect(() => parseCalendarDate("20/08/2026")).toThrow(RangeError);
    expect(() => parseCalendarDate("2026-8-20")).toThrow(RangeError);
    expect(() => parseCalendarDate("2026-08-20T00:00:00Z")).toThrow(RangeError);
    expect(() => parseCalendarDate("")).toThrow(RangeError);
  });

  it("rejeita data inexistente em vez de transbordar silenciosamente", () => {
    // `new Date("2026-02-30")` seria aceito e viraria 02/03.
    expect(() => parseCalendarDate("2026-02-30")).toThrow(/inexistente/);
    expect(() => parseCalendarDate("2026-13-01")).toThrow(/inexistente/);
    expect(() => parseCalendarDate("2026-00-10")).toThrow(/inexistente/);
    expect(() => parseCalendarDate("2026-08-00")).toThrow(/inexistente/);
  });

  it("aceita 29/02 em ano bissexto e recusa em ano comum", () => {
    expect(parseCalendarDate("2028-02-29").toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(() => parseCalendarDate("2026-02-29")).toThrow(/inexistente/);
  });

  it("faz ida e volta com toCalendarDate", () => {
    expect(toCalendarDate(parseCalendarDate("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("competencyOf", () => {
  it("lê ano e mês em UTC", () => {
    expect(competencyOf(parseCalendarDate("2026-08-20"))).toEqual({ year: 2026, month: 8 });
    expect(competencyOf(parseCalendarDate("2026-01-01"))).toEqual({ year: 2026, month: 1 });
    expect(competencyOf(parseCalendarDate("2026-12-31"))).toEqual({ year: 2026, month: 12 });
  });
});

describe("todayCalendarDate", () => {
  it("usa o relógio local, não UTC", () => {
    // 21/08 01:00 UTC = 20/08 22:00 em São Paulo. Para quem está lá, hoje é 20.
    const instant = new Date("2026-08-21T01:00:00.000Z");

    setTimeZone("America/Sao_Paulo");
    expect(todayCalendarDate(instant)).toBe("2026-08-20");

    setTimeZone("UTC");
    expect(todayCalendarDate(instant)).toBe("2026-08-21");
  });

  it("preenche zeros à esquerda", () => {
    setTimeZone("UTC");

    expect(todayCalendarDate(new Date("2026-01-05T12:00:00.000Z"))).toBe("2026-01-05");
  });

  it("produz valor aceito por parseCalendarDate", () => {
    expect(() => parseCalendarDate(todayCalendarDate())).not.toThrow();
  });
});

describe("currentCompetency", () => {
  it("usa o mês local, que pode diferir do mês UTC na virada", () => {
    // 01/09 01:00 UTC = 31/08 22:00 em São Paulo: ainda é agosto para o usuário.
    const instant = new Date("2026-09-01T01:00:00.000Z");

    setTimeZone("America/Sao_Paulo");
    expect(currentCompetency(instant)).toEqual({ year: 2026, month: 8 });

    setTimeZone("UTC");
    expect(currentCompetency(instant)).toEqual({ year: 2026, month: 9 });
  });
});

/**
 * O motivo de existir deste módulo: o resultado tem de ser idêntico em
 * America/Sao_Paulo (esta máquina) e UTC (Vercel). Um helper que usasse
 * componentes locais falharia aqui.
 */
describe("estabilidade entre fusos", () => {
  itAcrossTimeZones("produz o mesmo instante", () => {
    expect(utcDate(2026, 8, 20).toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(utcDateClamped(2026, 2, 31).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(parseCalendarDate("2026-08-20").toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(toCalendarDate(parseCalendarDate("2026-08-20"))).toBe("2026-08-20");
    expect(monthRange(2026, 8).start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(competencyOf(parseCalendarDate("2026-08-01"))).toEqual({ year: 2026, month: 8 });
  });

  it("comprova que a construção local NÃO é estável (o bug que isto evita)", () => {
    setTimeZone("UTC");
    const emUtc = new Date(2026, 7, 20).toISOString();

    setTimeZone("Asia/Tokyo");
    const emTokyo = new Date(2026, 7, 20).toISOString();

    expect(emUtc).not.toBe(emTokyo);
    expect(emUtc).toBe("2026-08-20T00:00:00.000Z");
    expect(emTokyo).toBe("2026-08-19T15:00:00.000Z");
  });
});
