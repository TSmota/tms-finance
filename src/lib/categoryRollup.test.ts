import { describe, expect, it } from "vitest";

import {
  capSlices,
  NO_CATEGORY,
  rollupByCategory,
  rootIndex,
  sliceTotal,
} from "./categoryRollup";
import { money } from "./money";

const MORADIA = { id: "c1", name: "Moradia", color: "#111111", parentId: null };
const LUZ = { id: "c2", name: "Luz", color: "#222222", parentId: "c1" };
const AGUA = { id: "c3", name: "Água", color: "#333333", parentId: "c1" };
const LAZER = { id: "c4", name: "Lazer", color: "#444444", parentId: null };

const CATEGORIES = [MORADIA, LUZ, AGUA, LAZER];

/** Fatias em formato compacto, para asserções legíveis. */
function slices(entries: Array<{ categoryId: string | null; value: string }>) {
  return rollupByCategory(CATEGORIES, entries).map((slice) => ({
    nome: slice.name,
    valor: slice.value,
    cor: slice.color,
  }));
}

describe("rollupByCategory — rollup de subcategoria", () => {
  it("soma a subcategoria dentro da categoria pai", () => {
    expect(
      slices([
        { categoryId: LUZ.id, value: "180.00" },
        { categoryId: AGUA.id, value: "90.00" },
        { categoryId: MORADIA.id, value: "30.00" },
      ]),
    ).toEqual([{ nome: "Moradia", valor: 300, cor: "#111111" }]);
  });

  it("usa o nome e a cor da raiz, não da subcategoria", () => {
    const [slice] = slices([{ categoryId: LUZ.id, value: "10.00" }]);

    expect(slice).toEqual({ nome: "Moradia", valor: 10, cor: "#111111" });
  });

  it("mantém categorias raiz separadas", () => {
    expect(
      slices([
        { categoryId: LUZ.id, value: "100.00" },
        { categoryId: LAZER.id, value: "250.00" },
      ]),
    ).toEqual([
      { nome: "Lazer", valor: 250, cor: "#444444" },
      { nome: "Moradia", valor: 100, cor: "#111111" },
    ]);
  });
});

describe("rollupByCategory — itens sem categoria", () => {
  it("caem em um grupo próprio, com id nulo", () => {
    const result = rollupByCategory(CATEGORIES, [
      { categoryId: null, value: "50.00" },
      { categoryId: LAZER.id, value: "20.00" },
    ]);

    expect(result).toEqual([
      { id: null, name: NO_CATEGORY, color: null, value: 50 },
      { id: "c4", name: "Lazer", color: "#444444", value: 20 },
    ]);
  });

  it("agrupam entre si, em vez de virar uma fatia cada", () => {
    const result = rollupByCategory(CATEGORIES, [
      { categoryId: null, value: "10.00" },
      { categoryId: null, value: "15.00" },
    ]);

    expect(result).toEqual([{ id: null, name: NO_CATEGORY, color: null, value: 25 }]);
  });

  it("categoria desconhecida — apagada durante o carregamento — cai em sem categoria", () => {
    expect(slices([{ categoryId: "apagada", value: "42.00" }])).toEqual([
      { nome: NO_CATEGORY, valor: 42, cor: null },
    ]);
  });

  it("subcategoria cujo pai não está no índice vira sua própria raiz", () => {
    const orphan = { id: "c9", name: "Órfã", color: "#999999", parentId: "inexistente" };

    expect(rollupByCategory([orphan], [{ categoryId: orphan.id, value: "5.00" }])).toEqual([
      { id: "c9", name: "Órfã", color: "#999999", value: 5 },
    ]);
  });
});

describe("rollupByCategory — ordenação", () => {
  it("é decrescente por valor", () => {
    expect(
      slices([
        { categoryId: LAZER.id, value: "10.00" },
        { categoryId: MORADIA.id, value: "999.00" },
        { categoryId: null, value: "500.00" },
      ]).map((slice) => slice.nome),
    ).toEqual(["Moradia", NO_CATEGORY, "Lazer"]);
  });

  it("desfaz empate pelo nome, para a ordem ser estável", () => {
    // Sem o critério de desempate, estas duas trocariam de lugar entre renders.
    expect(
      slices([
        { categoryId: LAZER.id, value: "100.00" },
        { categoryId: MORADIA.id, value: "100.00" },
      ]).map((slice) => slice.nome),
    ).toEqual(["Lazer", "Moradia"]);
  });

  it("desempata respeitando acentuação do pt-BR", () => {
    const categories = [
      { id: "a", name: "Água", color: null, parentId: null },
      { id: "z", name: "Zebra", color: null, parentId: null },
    ];

    const result = rollupByCategory(categories, [
      { categoryId: "z", value: "50.00" },
      { categoryId: "a", value: "50.00" },
    ]);

    // Em collation C.UTF-8 do Postgres, "Água" viria depois de "Zebra".
    expect(result.map((slice) => slice.name)).toEqual(["Água", "Zebra"]);
  });
});

describe("rollupByCategory — valores", () => {
  it("soma em decimal exato", () => {
    // 0,1 + 0,2 em float daria 0,30000000000000004.
    const result = rollupByCategory(CATEGORIES, [
      { categoryId: LAZER.id, value: money("0.10") },
      { categoryId: LAZER.id, value: money("0.20") },
    ]);

    expect(result[0]!.value).toBe(0.3);
  });

  it("descarta grupos que somam zero", () => {
    expect(rollupByCategory(CATEGORIES, [{ categoryId: LAZER.id, value: "0.00" }])).toEqual([]);
  });

  it("lista vazia produz lista vazia", () => {
    expect(rollupByCategory(CATEGORIES, [])).toEqual([]);
  });

  it("sliceTotal soma as fatias sem deriva", () => {
    const result = rollupByCategory(CATEGORIES, [
      { categoryId: LUZ.id, value: "0.10" },
      { categoryId: LAZER.id, value: "0.20" },
    ]);

    expect(sliceTotal(result)).toBe(0.3);
  });
});

describe("rootIndex", () => {
  it("devolve a própria categoria quando ela é raiz", () => {
    expect(rootIndex(CATEGORIES)(MORADIA.id)).toEqual(MORADIA);
  });

  it("devolve a raiz de uma subcategoria", () => {
    expect(rootIndex(CATEGORIES)(LUZ.id)).toEqual(MORADIA);
  });

  it("devolve nulo para id desconhecido", () => {
    expect(rootIndex(CATEGORIES)("nada")).toBeNull();
  });
});

describe("capSlices — limite de fatias", () => {
  /** Fatias sintéticas em ordem decrescente, como o rollup produz. */
  function make(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      id: `c${index}`,
      name: `Cat ${index}`,
      color: null,
      value: count - index,
    }));
  }

  it("não mexe quando cabe", () => {
    const slices = make(4);

    expect(capSlices(slices, 8)).toEqual(slices);
    expect(capSlices(slices, 4)).toEqual(slices);
  });

  it("não troca uma única fatia excedente por Outras", () => {
    // Seria esconder informação sem economizar espaço.
    const slices = make(5);

    expect(capSlices(slices, 4)).toEqual(slices);
  });

  it("agrupa a cauda preservando o total", () => {
    const slices = make(10);
    const capped = capSlices(slices, 3);

    expect(capped).toHaveLength(4);
    expect(capped[3]).toEqual({
      id: null,
      name: "Outras (7)",
      color: null,
      // 10+9+8 ficam; 7+6+5+4+3+2+1 = 28 agrupam.
      value: 28,
    });
    expect(sliceTotal(capped)).toBe(sliceTotal(slices));
  });

  it("soma a cauda em decimal exato", () => {
    const slices = [
      { id: "a", name: "A", color: null, value: 1 },
      { id: "b", name: "B", color: null, value: 0.1 },
      { id: "c", name: "C", color: null, value: 0.2 },
    ];

    expect(capSlices(slices, 1)[1]!.value).toBe(0.3);
  });

  it("lista vazia e limite inválido não quebram", () => {
    expect(capSlices([], 5)).toEqual([]);
    expect(capSlices(make(3), 0)).toEqual(make(3));
  });
});
