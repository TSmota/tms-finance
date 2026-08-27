import { describe, expect, it } from "vitest";

import { byLabel, byName, compareNames } from "./sorting";

describe("compareNames", () => {
  it("coloca acentuadas na posição correta, ao contrário da ordem por byte", () => {
    const nomes = ["Zebra", "Água", "Luz", "Óleo", "Alimentação"];

    expect([...nomes].sort(compareNames)).toEqual([
      "Água",
      "Alimentação",
      "Luz",
      "Óleo",
      "Zebra",
    ]);

    // A ordem ingênua (a mesma que o Postgres em C.UTF-8 produz) erra:
    expect([...nomes].sort()).toEqual(["Alimentação", "Luz", "Zebra", "Água", "Óleo"]);
  });

  it("trata acento como equivalente à letra base", () => {
    expect(compareNames("agua", "Água")).toBe(0);
    expect(compareNames("Ó", "o")).toBe(0);
  });

  it("ignora diferença de caixa", () => {
    expect(compareNames("mercado", "MERCADO")).toBe(0);
  });

  it("ordena números embutidos numericamente", () => {
    expect(["Conta 10", "Conta 2"].sort(compareNames)).toEqual(["Conta 2", "Conta 10"]);
  });

  it("é consistente e antissimétrico", () => {
    expect(compareNames("Água", "Zebra")).toBeLessThan(0);
    expect(compareNames("Zebra", "Água")).toBeGreaterThan(0);
    expect(compareNames("Luz", "Luz")).toBe(0);
  });
});

describe("comparadores de objeto", () => {
  it("byName ordena por nome", () => {
    const items = [{ name: "Zebra" }, { name: "Água" }];

    expect(items.sort(byName).map((item) => item.name)).toEqual(["Água", "Zebra"]);
  });

  it("byLabel ordena por rótulo", () => {
    const items = [{ label: "Óleo" }, { label: "Alimentação" }];

    expect(items.sort(byLabel).map((item) => item.label)).toEqual(["Alimentação", "Óleo"]);
  });
});
