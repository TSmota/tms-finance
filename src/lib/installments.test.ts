import { describe, expect, it } from "vitest";

import { InvalidOperationError } from "./errors";
import { MAX_INSTALLMENTS, splitInstallments } from "./installments";
import { sumMoney } from "./money";

/** Atalho para comparar o resultado como strings de 2 casas. */
function split(total: string, count: number): string[] {
  return splitInstallments(total, count).map((value) => value.toFixed(2));
}

describe("resto dos centavos na primeira parcela", () => {
  it("divide 100,00 em 3x como 33,34 + 33,33 + 33,33", () => {
    expect(split("100.00", 3)).toEqual(["33.34", "33.33", "33.33"]);
  });

  it("divide 0,10 em 3x como 0,04 + 0,03 + 0,03", () => {
    expect(split("0.10", 3)).toEqual(["0.04", "0.03", "0.03"]);
  });

  it("divide 10,00 em 3x como 3,34 + 3,33 + 3,33", () => {
    expect(split("10.00", 3)).toEqual(["3.34", "3.33", "3.33"]);
  });

  it("não sobra resto quando a divisão é exata", () => {
    expect(split("300.00", 3)).toEqual(["100.00", "100.00", "100.00"]);
    expect(split("100.00", 4)).toEqual(["25.00", "25.00", "25.00", "25.00"]);
  });

  it("devolve o total em parcela única", () => {
    expect(split("99.99", 1)).toEqual(["99.99"]);
  });

  it("acumula 2 centavos de resto na primeira parcela", () => {
    // 1,00 / 7 = 0,142857… → base 0,14; 0,14 × 7 = 0,98; resto 0,02.
    expect(split("1.00", 7)).toEqual([
      "0.16",
      "0.14",
      "0.14",
      "0.14",
      "0.14",
      "0.14",
      "0.14",
    ]);
  });

  it("nunca deixa parcela posterior maior que a primeira", () => {
    const parcelas = splitInstallments("100.00", 3);

    for (const parcela of parcelas.slice(1)) {
      expect(parcela.lessThanOrEqualTo(parcelas[0]!)).toBe(true);
    }
  });
});

/**
 * A propriedade que realmente importa: a fatura não pode fechar com diferença
 * de centavo. Verificada sobre uma tabela de casos, não num exemplo só.
 */
describe("a soma das parcelas é sempre exatamente o total", () => {
  const totais = [
    "0.03",
    "0.10",
    "1.00",
    "9.99",
    "10.00",
    "33.33",
    "100.00",
    "123.45",
    "999.99",
    "1000.00",
    "8765.43",
    "999999.99",
  ];
  const contagens = [1, 2, 3, 4, 5, 6, 7, 10, 12, 18, 24];

  it.each(totais)("total %s fecha para todas as contagens viáveis", (total) => {
    for (const count of contagens) {
      let parcelas;

      try {
        parcelas = splitInstallments(total, count);
      } catch (error) {
        // Total pequeno demais para o número de parcelas: caso coberto adiante.
        expect(error).toBeInstanceOf(InvalidOperationError);
        continue;
      }

      expect(parcelas).toHaveLength(count);
      expect(sumMoney(parcelas).toFixed(2)).toBe(Number(total).toFixed(2));

      for (const parcela of parcelas) {
        expect(parcela.greaterThan(0)).toBe(true);
      }
    }
  });
});

describe("entradas inválidas", () => {
  it("recusa contagem zero, negativa ou fracionária", () => {
    expect(() => splitInstallments("100.00", 0)).toThrow(InvalidOperationError);
    expect(() => splitInstallments("100.00", -1)).toThrow(InvalidOperationError);
    expect(() => splitInstallments("100.00", 2.5)).toThrow(InvalidOperationError);
    expect(() => splitInstallments("100.00", Number.NaN)).toThrow(InvalidOperationError);
  });

  it("recusa contagem acima do teto", () => {
    expect(() => splitInstallments("100000.00", MAX_INSTALLMENTS + 1)).toThrow(
      /não pode passar de/,
    );
    expect(() => splitInstallments("100000.00", MAX_INSTALLMENTS)).not.toThrow();
  });

  it("recusa total zero ou negativo", () => {
    expect(() => splitInstallments("0.00", 3)).toThrow(/deve ser positivo/);
    expect(() => splitInstallments("-10.00", 3)).toThrow(/deve ser positivo/);
  });

  it("recusa parcelamento que geraria parcela abaixo de um centavo", () => {
    // 0,01 em 3x daria 0,01 + 0,00 + 0,00, e o banco recusa valor zero.
    expect(() => splitInstallments("0.01", 3)).toThrow(/abaixo de um centavo/);
    expect(() => splitInstallments("0.02", 3)).toThrow(/abaixo de um centavo/);
    // 0,03 em 3x é o menor caso viável.
    expect(split("0.03", 3)).toEqual(["0.01", "0.01", "0.01"]);
  });
});
