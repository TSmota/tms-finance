import { describe, expect, it } from "vitest";

import { itAcrossTimeZones } from "@tests/support/timeZones";

import { parseCalendarDate, toCalendarDate } from "./dates";
import { InvalidOperationError } from "./errors";
import {
  competenciesToMaterialize,
  occurrencesInMonth,
  type Frequency,
  type RecurrenceRule,
} from "./recurrence";

/** Regra mínima; cada teste sobrescreve só o que lhe interessa. */
function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    frequency: "MONTHLY",
    dueDay: 10,
    startDate: parseCalendarDate("2026-01-01"),
    endDate: null,
    active: true,
    ...overrides,
  };
}

/** Ocorrências como `YYYY-MM-DD`, para asserções legíveis. */
function dates(overrides: Partial<RecurrenceRule>, year: number, month: number): string[] {
  return occurrencesInMonth(rule(overrides), year, month).map(toCalendarDate);
}

describe("recorrência mensal", () => {
  it("gera uma ocorrência no dia do vencimento", () => {
    expect(dates({ dueDay: 15 }, 2026, 8)).toEqual(["2026-08-15"]);
  });

  it("faz clamp no último dia do mês quando o dia não existe", () => {
    expect(dates({ dueDay: 31 }, 2026, 2)).toEqual(["2026-02-28"]);
    expect(dates({ dueDay: 31 }, 2028, 2)).toEqual(["2028-02-29"]);
    expect(dates({ dueDay: 31 }, 2026, 4)).toEqual(["2026-04-30"]);
  });

  it("gera no dia 31 nos meses que o têm", () => {
    expect(dates({ dueDay: 31 }, 2026, 1)).toEqual(["2026-01-31"]);
  });
});

describe("recorrência anual", () => {
  it("só aparece no mês do aniversário, tirado de startDate", () => {
    const yearly = {
      frequency: "YEARLY" as Frequency,
      dueDay: 5,
      startDate: parseCalendarDate("2026-03-05"),
    };

    expect(dates(yearly, 2026, 3)).toEqual(["2026-03-05"]);
    expect(dates(yearly, 2027, 3)).toEqual(["2027-03-05"]);
    expect(dates(yearly, 2026, 4)).toEqual([]);
    expect(dates(yearly, 2026, 2)).toEqual([]);
  });

  it("aniversário em 29 de fevereiro cai no dia 28 nos anos comuns", () => {
    const yearly = {
      frequency: "YEARLY" as Frequency,
      dueDay: 29,
      startDate: parseCalendarDate("2028-02-29"),
    };

    expect(dates(yearly, 2028, 2)).toEqual(["2028-02-29"]);
    expect(dates(yearly, 2029, 2)).toEqual(["2029-02-28"]);
  });
});

describe("recorrência semanal", () => {
  const weekly = { frequency: "WEEKLY" as Frequency };

  it("rende 4 ou 5 ocorrências conforme o mês", () => {
    // 2026-08-01 é sábado; agosto tem 5 sábados.
    expect(dates({ ...weekly, startDate: parseCalendarDate("2026-08-01") }, 2026, 8)).toEqual([
      "2026-08-01",
      "2026-08-08",
      "2026-08-15",
      "2026-08-22",
      "2026-08-29",
    ]);

    // Setembro de 2026 tem 4 sábados a partir do dia 5.
    expect(dates({ ...weekly, startDate: parseCalendarDate("2026-08-01") }, 2026, 9)).toEqual([
      "2026-09-05",
      "2026-09-12",
      "2026-09-19",
      "2026-09-26",
    ]);
  });

  it("mantém o dia da semana ao atravessar o mês", () => {
    const start = parseCalendarDate("2026-01-07");
    const weekdays = new Set(
      [1, 2, 3, 4, 5, 6].flatMap((month) =>
        occurrencesInMonth(rule({ ...weekly, startDate: start }), 2026, month).map((date) =>
          date.getUTCDay(),
        ),
      ),
    );

    expect([...weekdays]).toEqual([start.getUTCDay()]);
  });

  it("ignora dueDay: a semana segue startDate", () => {
    const start = parseCalendarDate("2026-08-03");

    expect(dates({ ...weekly, startDate: start, dueDay: 25 }, 2026, 8)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ]);
  });
});

describe("vigência", () => {
  it("não gera antes de startDate, mesmo na competência inicial", () => {
    expect(dates({ dueDay: 10, startDate: parseCalendarDate("2026-08-15") }, 2026, 8)).toEqual([]);
    expect(dates({ dueDay: 10, startDate: parseCalendarDate("2026-08-15") }, 2026, 9)).toEqual([
      "2026-09-10",
    ]);
  });

  it("gera no próprio startDate", () => {
    expect(dates({ dueDay: 15, startDate: parseCalendarDate("2026-08-15") }, 2026, 8)).toEqual([
      "2026-08-15",
    ]);
  });

  it("não gera depois de endDate, e gera no próprio endDate", () => {
    const bounded = { dueDay: 10, endDate: parseCalendarDate("2026-09-10") };

    expect(dates(bounded, 2026, 9)).toEqual(["2026-09-10"]);
    expect(dates(bounded, 2026, 10)).toEqual([]);
  });

  it("não gera nada quando desativada", () => {
    expect(dates({ active: false }, 2026, 8)).toEqual([]);
  });
});

describe("validação da regra", () => {
  it("rejeita dia fora de 1-31", () => {
    expect(() => occurrencesInMonth(rule({ dueDay: 0 }), 2026, 8)).toThrow(InvalidOperationError);
    expect(() => occurrencesInMonth(rule({ dueDay: 32 }), 2026, 8)).toThrow(InvalidOperationError);
    expect(() => occurrencesInMonth(rule({ dueDay: 1.5 }), 2026, 8)).toThrow(
      InvalidOperationError,
    );
  });

  it("rejeita endDate anterior a startDate", () => {
    const invalid = rule({
      startDate: parseCalendarDate("2026-08-01"),
      endDate: parseCalendarDate("2026-07-31"),
    });

    expect(() => occurrencesInMonth(invalid, 2026, 8)).toThrow(InvalidOperationError);
  });
});

describe("janela de materialização", () => {
  const target = { year: 2026, month: 8 };

  it("sem watermark, começa na competência de startDate", () => {
    expect(
      competenciesToMaterialize({
        startDate: parseCalendarDate("2026-06-10"),
        materializedThrough: null,
        target,
        maxMonths: 24,
      }),
    ).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });

  it("com watermark, retoma na competência seguinte", () => {
    expect(
      competenciesToMaterialize({
        startDate: parseCalendarDate("2026-01-10"),
        materializedThrough: parseCalendarDate("2026-06-30"),
        target,
        maxMonths: 24,
      }),
    ).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });

  it("nada a fazer quando o alvo já está coberto", () => {
    expect(
      competenciesToMaterialize({
        startDate: parseCalendarDate("2026-01-10"),
        materializedThrough: parseCalendarDate("2026-08-31"),
        target,
        maxMonths: 24,
      }),
    ).toEqual([]);

    expect(
      competenciesToMaterialize({
        startDate: parseCalendarDate("2026-01-10"),
        materializedThrough: parseCalendarDate("2026-12-31"),
        target,
        maxMonths: 24,
      }),
    ).toEqual([]);
  });

  it("nada a fazer quando o alvo é anterior a startDate", () => {
    expect(
      competenciesToMaterialize({
        startDate: parseCalendarDate("2026-10-01"),
        materializedThrough: null,
        target,
        maxMonths: 24,
      }),
    ).toEqual([]);
  });

  it("vira o ano", () => {
    expect(
      competenciesToMaterialize({
        startDate: parseCalendarDate("2025-11-05"),
        materializedThrough: null,
        target: { year: 2026, month: 1 },
        maxMonths: 24,
      }),
    ).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ]);
  });

  it("trunca pelo início, mantendo as competências mais recentes", () => {
    const window = competenciesToMaterialize({
      startDate: parseCalendarDate("2010-01-01"),
      materializedThrough: null,
      target,
      maxMonths: 3,
    });

    expect(window).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });
});

describe("estabilidade entre fusos", () => {
  itAcrossTimeZones("produz as mesmas ocorrências", () => {
    expect(dates({ dueDay: 31 }, 2026, 2)).toEqual(["2026-02-28"]);
    expect(dates({ frequency: "WEEKLY", startDate: parseCalendarDate("2026-08-01") }, 2026, 8))
      .toEqual([
        "2026-08-01",
        "2026-08-08",
        "2026-08-15",
        "2026-08-22",
        "2026-08-29",
      ]);
  });
});
