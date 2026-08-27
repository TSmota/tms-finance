import { afterAll, describe, expect, it } from "vitest";

import { parseCalendarDate, toCalendarDate } from "./dates";
import { InvalidOperationError } from "./errors";
import {
  consecutiveCompetencies,
  invoiceCompetencyFor,
  invoiceCycleDates,
} from "./invoiceCycle";

/** Competência da compra, para um cartão que fecha em `closingDay`. */
function competency(closingDay: number, date: string) {
  return invoiceCompetencyFor({ closingDay, dueDay: 10 }, parseCalendarDate(date));
}

describe("competência da compra", () => {
  it("no próprio dia do fechamento, entra na fatura do mês", () => {
    expect(competency(20, "2026-08-20")).toEqual({ year: 2026, month: 8 });
  });

  it("um dia depois do fechamento, vai para a fatura seguinte", () => {
    expect(competency(20, "2026-08-21")).toEqual({ year: 2026, month: 9 });
  });

  it("antes do fechamento, entra na fatura do mês", () => {
    expect(competency(20, "2026-08-01")).toEqual({ year: 2026, month: 8 });
    expect(competency(20, "2026-08-19")).toEqual({ year: 2026, month: 8 });
  });

  it("vira o ano quando a compra é depois do fechamento de dezembro", () => {
    expect(competency(20, "2026-12-21")).toEqual({ year: 2027, month: 1 });
    expect(competency(20, "2026-12-31")).toEqual({ year: 2027, month: 1 });
  });

  it("fechamento no dia 1: só o dia 1 entra na fatura do mês", () => {
    expect(competency(1, "2026-08-01")).toEqual({ year: 2026, month: 8 });
    expect(competency(1, "2026-08-02")).toEqual({ year: 2026, month: 9 });
  });

  it("fechamento no dia 31: todo o mês entra na fatura do mês", () => {
    expect(competency(31, "2026-01-31")).toEqual({ year: 2026, month: 1 });
    expect(competency(31, "2026-01-01")).toEqual({ year: 2026, month: 1 });
  });

  it("fechamento 31 em fevereiro vale como último dia do mês", () => {
    // Não existe 31/02: o fechamento efetivo é 28 (ou 29 em ano bissexto),
    // então nenhuma compra de fevereiro escapa para março.
    expect(competency(31, "2026-02-28")).toEqual({ year: 2026, month: 2 });
    expect(competency(31, "2028-02-29")).toEqual({ year: 2028, month: 2 });
  });

  it("fechamento 30 em fevereiro também vale como último dia", () => {
    expect(competency(30, "2026-02-28")).toEqual({ year: 2026, month: 2 });
  });

  it("fechamento 31 em abril (30 dias) vale como dia 30", () => {
    expect(competency(31, "2026-04-30")).toEqual({ year: 2026, month: 4 });
  });

  it("recusa dia de fechamento fora de 1-31", () => {
    expect(() => competency(0, "2026-08-10")).toThrow(InvalidOperationError);
    expect(() => competency(32, "2026-08-10")).toThrow(InvalidOperationError);
  });
});

describe("datas do ciclo", () => {
  it("vencimento no mês seguinte quando é anterior ao fechamento", () => {
    // "Fecha dia 20, vence dia 5" — o caso mais comum.
    const { closingDate, dueDate } = invoiceCycleDates(
      { closingDay: 20, dueDay: 5 },
      { year: 2026, month: 8 },
    );

    expect(toCalendarDate(closingDate)).toBe("2026-08-20");
    expect(toCalendarDate(dueDate)).toBe("2026-09-05");
  });

  it("vencimento no mesmo mês quando é posterior ao fechamento", () => {
    const { closingDate, dueDate } = invoiceCycleDates(
      { closingDay: 5, dueDay: 20 },
      { year: 2026, month: 8 },
    );

    expect(toCalendarDate(closingDate)).toBe("2026-08-05");
    expect(toCalendarDate(dueDate)).toBe("2026-08-20");
  });

  it("vencimento no mês seguinte quando coincide com o fechamento", () => {
    const { dueDate } = invoiceCycleDates(
      { closingDay: 10, dueDay: 10 },
      { year: 2026, month: 8 },
    );

    expect(toCalendarDate(dueDate)).toBe("2026-09-10");
  });

  it("vira o ano no vencimento de dezembro", () => {
    const { closingDate, dueDate } = invoiceCycleDates(
      { closingDay: 20, dueDay: 5 },
      { year: 2026, month: 12 },
    );

    expect(toCalendarDate(closingDate)).toBe("2026-12-20");
    expect(toCalendarDate(dueDate)).toBe("2027-01-05");
  });

  it("limita o dia ao último do mês em fevereiro", () => {
    const { closingDate, dueDate } = invoiceCycleDates(
      { closingDay: 31, dueDay: 30 },
      { year: 2026, month: 2 },
    );

    expect(toCalendarDate(closingDate)).toBe("2026-02-28");
    // dueDay 30 <= closingDay 31, então vence em março, onde o dia 30 existe.
    expect(toCalendarDate(dueDate)).toBe("2026-03-30");
  });

  it("limita o vencimento quando o dia não existe no mês de vencimento", () => {
    const { dueDate } = invoiceCycleDates(
      { closingDay: 20, dueDay: 31 },
      { year: 2026, month: 1 },
    );

    // dueDay 31 > closingDay 20 → vence em janeiro mesmo, dia 31 existe.
    expect(toCalendarDate(dueDate)).toBe("2026-01-31");

    const fevereiro = invoiceCycleDates(
      { closingDay: 20, dueDay: 31 },
      { year: 2026, month: 2 },
    );
    expect(toCalendarDate(fevereiro.dueDate)).toBe("2026-02-28");
  });

  it("o vencimento nunca é anterior ao fechamento", () => {
    for (const closingDay of [1, 5, 10, 15, 20, 28, 31]) {
      for (const dueDay of [1, 5, 10, 15, 20, 28, 31]) {
        for (const month of [1, 2, 4, 12]) {
          const { closingDate, dueDate } = invoiceCycleDates(
            { closingDay, dueDay },
            { year: 2026, month },
          );

          expect(dueDate.getTime()).toBeGreaterThanOrEqual(closingDate.getTime());
        }
      }
    }
  });
});

describe("competências consecutivas para parcelas", () => {
  it("gera a sequência a partir da inicial", () => {
    expect(consecutiveCompetencies({ year: 2026, month: 8 }, 3)).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ]);
  });

  it("vira o ano no meio da sequência", () => {
    expect(consecutiveCompetencies({ year: 2026, month: 11 }, 4)).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
  });

  it("gera uma só para parcela única", () => {
    expect(consecutiveCompetencies({ year: 2026, month: 8 }, 1)).toEqual([
      { year: 2026, month: 8 },
    ]);
  });
});

/** Mesma exigência de `@/lib/dates`: o resultado não pode depender do fuso. */
describe("estabilidade entre fusos", () => {
  const originalTz = process.env.TZ;

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it.each(["UTC", "America/Sao_Paulo", "Asia/Tokyo"])("é idêntico com TZ=%s", (tz) => {
    process.env.TZ = tz;

    expect(competency(20, "2026-08-20")).toEqual({ year: 2026, month: 8 });
    expect(competency(20, "2026-08-21")).toEqual({ year: 2026, month: 9 });

    const { closingDate, dueDate } = invoiceCycleDates(
      { closingDay: 20, dueDay: 5 },
      { year: 2026, month: 8 },
    );
    expect(toCalendarDate(closingDate)).toBe("2026-08-20");
    expect(toCalendarDate(dueDate)).toBe("2026-09-05");
  });
});
