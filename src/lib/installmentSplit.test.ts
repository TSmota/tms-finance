import { describe, expect, it } from "vitest";

import { describeSplit, splitCents } from "./installmentSplit";
import { MAX_INSTALLMENTS, splitInstallments } from "./installments";

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

/**
 * As duas bordas que a prévia e o servidor alcançam de verdade e que os casos
 * acima não tocavam: o teto de parcelas e um total que não é redondo em
 * centavos.
 */
describe("bordas", () => {
  it("divide em MAX_INSTALLMENTS sem perder centavo", () => {
    const parts = splitCents(100_000, MAX_INSTALLMENTS);

    expect(parts).toHaveLength(MAX_INSTALLMENTS);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(100_000);
    // 100000/120 = 833,33...: o resto todo vai para a primeira.
    expect(parts[0]).toBe(833 + 40);
    expect(new Set(parts.slice(1))).toEqual(new Set([833]));
  });

  it("recusa uma parcela a mais que o teto", () => {
    expect(() => splitInstallments("1000.00", MAX_INSTALLMENTS + 1)).toThrow(
      /não pode passar de/,
    );
  });

  it("arredonda a terceira casa antes de dividir, e não depois", () => {
    // `Decimal(12,2)` é o que a coluna guarda: dividir 100.005 em 2 e só então
    // arredondar daria duas parcelas de 50.00, somando um centavo a menos que o
    // total gravado.
    const parts = splitInstallments("100.005", 2);

    expect(parts.map((part) => part.toFixed(2))).toEqual(["50.01", "50.00"]);
  });

  it("concorda com a prévia também no total de três casas", () => {
    const doServidor = splitInstallments("100.005", 3).map((value) =>
      Math.round(value.times(100).toNumber()),
    );

    expect(doServidor).toEqual(splitCents(10_001, 3));
  });

  it("recusa dividir menos de um centavo por parcela", () => {
    // O CHECK `transactions_positive_amounts_check` recusaria a parcela de zero.
    expect(() => splitInstallments("0.02", 3)).toThrow(/abaixo de um centavo/);
  });
});

