import { describe, expect, it } from "vitest";

import {
  convertMoney,
  isPositive,
  isZero,
  money,
  moneyEquals,
  roundMoney,
  sumMoney,
  toStorage,
  ZERO,
} from "./money";

describe("exatidão decimal", () => {
  it("soma sem a deriva do binário flutuante", () => {
    // Em `number`: 0.1 + 0.2 === 0.30000000000000004
    expect(money("0.1").plus("0.2").toFixed(2)).toBe("0.30");
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("não acumula erro somando centavos mil vezes", () => {
    const values = Array.from({ length: 1000 }, () => "0.01");

    expect(sumMoney(values).toFixed(2)).toBe("10.00");

    // O mesmo laço em `number` erra:
    const comFloat = values.reduce((total, value) => total + Number(value), 0);
    expect(comFloat).not.toBe(10);
  });

  it("preserva precisão em valores grandes", () => {
    expect(money("1234567890.12").plus("0.01").toFixed(2)).toBe("1234567890.13");
  });
});

describe("roundMoney", () => {
  it("arredonda half-up, a convenção de moeda", () => {
    expect(roundMoney("0.005").toFixed(2)).toBe("0.01");
    expect(roundMoney("0.004").toFixed(2)).toBe("0.00");
    expect(roundMoney("2.345").toFixed(2)).toBe("2.35");
    expect(roundMoney("-0.005").toFixed(2)).toBe("-0.01");
  });

  it("não altera valores já com 2 casas", () => {
    expect(roundMoney("450.30").toFixed(2)).toBe("450.30");
  });
});

describe("toStorage", () => {
  it("sempre produz string com exatamente 2 casas", () => {
    expect(toStorage(0)).toBe("0.00");
    expect(toStorage(5)).toBe("5.00");
    expect(toStorage("5.1")).toBe("5.10");
    expect(toStorage("5.999")).toBe("6.00");
    expect(toStorage(-3.5)).toBe("-3.50");
  });

  it("devolve string, não number, para não passar por float até o Postgres", () => {
    expect(typeof toStorage("450.30")).toBe("string");
  });

  it("aceita number vindo do formulário sem introduzir erro", () => {
    expect(toStorage(450.3)).toBe("450.30");
    expect(toStorage(39.9)).toBe("39.90");
  });
});

describe("sumMoney", () => {
  it("devolve zero para lista vazia", () => {
    expect(sumMoney([]).toFixed(2)).toBe("0.00");
  });

  it("soma valores mistos de string e number", () => {
    expect(sumMoney(["33.34", "33.33", 33.33]).toFixed(2)).toBe("100.00");
  });

  it("lida com negativos", () => {
    expect(sumMoney(["100.00", "-30.50"]).toFixed(2)).toBe("69.50");
  });
});

describe("convertMoney", () => {
  it("aplica a taxa e arredonda a 2 casas", () => {
    // 15,00 USD × 5,40 = 81,00 BRL
    expect(convertMoney("15.00", "5.4000").toFixed(2)).toBe("81.00");
  });

  it("arredonda o produto, não os operandos", () => {
    // 10,00 × 5,2537 = 52,537 → 52,54
    expect(convertMoney("10.00", "5.2537").toFixed(2)).toBe("52.54");
    // 3,33 × 1,1111 = 3,7000... → 3,70
    expect(convertMoney("3.33", "1.1111").toFixed(2)).toBe("3.70");
  });

  it("é identidade com taxa 1", () => {
    expect(convertMoney("450.30", 1).toFixed(2)).toBe("450.30");
  });

  it("não perde centavos em taxas de 4 casas", () => {
    expect(convertMoney("1000.00", "0.1837").toFixed(2)).toBe("183.70");
  });
});

describe("predicados", () => {
  it("isPositive exige estritamente maior que zero", () => {
    expect(isPositive("0.01")).toBe(true);
    expect(isPositive(0)).toBe(false);
    expect(isPositive("-0.01")).toBe(false);
  });

  it("isZero reconhece as várias grafias do zero", () => {
    expect(isZero(0)).toBe(true);
    expect(isZero("0.00")).toBe(true);
    expect(isZero("-0.00")).toBe(true);
    expect(isZero("0.01")).toBe(false);
  });

  it("moneyEquals compara após arredondar a 2 casas", () => {
    expect(moneyEquals("10.00", 10)).toBe(true);
    expect(moneyEquals("10.001", "10.00")).toBe(true);
    expect(moneyEquals("10.01", "10.00")).toBe(false);
  });

  it("ZERO é zero", () => {
    expect(ZERO.toFixed(2)).toBe("0.00");
  });
});
