import { describe, expect, it } from "vitest";
import { Currency, Prisma } from "@prisma/client";

import {
  CURRENCIES,
  CURRENCY_LABELS,
  CURRENCY_OPTIONS,
  formatCurrency,
  toNumber,
} from "./currency";

describe("lista de moedas", () => {
  /**
   * Guarda contra divergência silenciosa: se alguém acrescentar uma moeda ao
   * enum do Prisma e esquecer da lista (ou vice-versa), os `Select`s e os
   * schemas Zod ficariam dessincronizados do banco sem nenhum erro de tipo.
   */
  it("cobre exatamente o enum Currency do Prisma", () => {
    expect([...CURRENCIES].sort()).toEqual(Object.values(Currency).sort());
  });

  it("tem rótulo para cada moeda", () => {
    for (const code of CURRENCIES) {
      expect(CURRENCY_LABELS[code]).toBeTruthy();
    }
  });

  it("gera opções de Select na mesma ordem da lista", () => {
    expect(CURRENCY_OPTIONS.map((option) => option.value)).toEqual([...CURRENCIES]);
  });
});

describe("formatCurrency", () => {
  it("formata em pt-BR", () => {
    //   é o espaço não-quebrável que o Intl insere depois do símbolo.
    expect(formatCurrency(8228.7, "BRL")).toBe("R$ 8.228,70");
    expect(formatCurrency(0, "BRL")).toBe("R$ 0,00");
  });

  it("formata moeda estrangeira", () => {
    expect(formatCurrency(1975, "USD")).toBe("US$ 1.975,00");
  });

  it("mostra o sinal de valores negativos", () => {
    expect(formatCurrency(-120.5, "BRL")).toBe("-R$ 120,50");
  });

  it("cai para formato simples se a moeda for inválida", () => {
    expect(formatCurrency(10, "XYZ_INVALIDO")).toBe("XYZ_INVALIDO 10.00");
  });
});

describe("toNumber", () => {
  it("converte Decimal do Prisma", () => {
    expect(toNumber(new Prisma.Decimal("8228.70"))).toBe(8228.7);
  });

  it("converte string numérica", () => {
    expect(toNumber("450.30")).toBe(450.3);
  });

  it("trata valores não finitos como 0", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber("abc")).toBe(0);
    expect(toNumber(NaN)).toBe(0);
    expect(toNumber(Infinity)).toBe(0);
  });
});
