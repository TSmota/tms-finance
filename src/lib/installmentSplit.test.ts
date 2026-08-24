import { describe, expect, it } from "vitest";

import { describeSplit, splitCents } from "./installmentSplit";
import { splitInstallments } from "./installments";

describe("splitCents", () => {
  it("coloca o resto na primeira parcela", () => {
    expect(splitCents(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitCents(10, 3)).toEqual([4, 3, 3]);
  });

  it("divide exatamente quando não há resto", () => {
    expect(splitCents(30000, 3)).toEqual([10000, 10000, 10000]);
  });

  it("devolve o total em parcela única", () => {
    expect(splitCents(9999, 1)).toEqual([9999]);
  });

  it("a soma é sempre o total", () => {
    for (const total of [1, 3, 10, 100, 999, 10000, 123456, 99999999]) {
      for (const count of [1, 2, 3, 7, 12, 24]) {
        if (total < count) {
          continue;
        }

        const parts = splitCents(total, count);

        expect(parts).toHaveLength(count);
        expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
        expect(Math.min(...parts)).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * A razão de este módulo existir: a prévia no formulário e o valor gravado pelo
 * servidor precisam sair da mesma regra. Este teste é o que garante isso.
 */
describe("servidor e prévia não divergem", () => {
  it("splitInstallments concorda com splitCents", () => {
    for (const total of ["0.03", "0.10", "1.00", "10.00", "100.00", "123.45", "9999.99"]) {
      for (const count of [1, 2, 3, 5, 7, 12]) {
        const cents = Math.round(Number(total) * 100);

        if (cents < count) {
          continue;
        }

        const doServidor = splitInstallments(total, count).map((value) =>
          Math.round(value.times(100).toNumber()),
        );

        expect(doServidor).toEqual(splitCents(cents, count));
      }
    }
  });
});

describe("describeSplit", () => {
  const format = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

  it("descreve a divisão desigual destacando a primeira parcela", () => {
    expect(describeSplit(10000, 3, format)).toBe("1ª de R$ 33.34 e 2× de R$ 33.33");
  });

  it("descreve a divisão exata de forma compacta", () => {
    expect(describeSplit(30000, 3, format)).toBe("3× de R$ 100.00");
  });

  it("não descreve nada à vista", () => {
    expect(describeSplit(10000, 1, format)).toBeNull();
    expect(describeSplit(10000, 0, format)).toBeNull();
  });

  it("não descreve divisão inviável", () => {
    expect(describeSplit(2, 3, format)).toBeNull();
    expect(describeSplit(0, 3, format)).toBeNull();
  });

  it("não descreve contagem fracionária", () => {
    expect(describeSplit(10000, 2.5, format)).toBeNull();
  });
});
