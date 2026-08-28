import { describe, expect, it } from "vitest";

import { groupByInstitution, NO_INSTITUTION } from "./grouping";

/**
 * Agrupamento de contas e cartões por instituição, para a visão multi-banco.
 *
 * O que estes testes protegem: o item **sem** instituição cair num balde
 * nomeado em vez de sumir da listagem — o modo de falhar que esconde dinheiro
 * do usuário sem erro nenhum.
 */

const account = (name: string, institution: string | null) => ({ name, institution });

describe("groupByInstitution", () => {
  it("junta itens da mesma instituição", () => {
    const groups = groupByInstitution([
      account("Conta corrente", "Nubank"),
      account("Cartão", "Nubank"),
      account("Internacional", "Wise"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.institution).toBe("Nubank");
    expect(groups[0]?.items.map((item) => item.name)).toEqual(["Conta corrente", "Cartão"]);
  });

  it("ordena instituições alfabeticamente, respeitando acentos", () => {
    const groups = groupByInstitution([
      account("a", "Zebra Bank"),
      account("b", "Órion"),
      account("c", "Águia"),
    ]);

    expect(groups.map((group) => group.institution)).toEqual(["Águia", "Órion", "Zebra Bank"]);
  });

  it("empurra o grupo sem instituição para o fim", () => {
    const groups = groupByInstitution([
      account("a", null),
      account("b", "Nubank"),
      account("c", "Águia"),
    ]);

    expect(groups.map((group) => group.institution)).toEqual([
      "Águia",
      "Nubank",
      NO_INSTITUTION,
    ]);
  });

  it("mantém sem instituição no fim mesmo sendo o único grupo restante", () => {
    const groups = groupByInstitution([account("a", null), account("b", null)]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.institution).toBe(NO_INSTITUTION);
    expect(groups[0]?.items).toHaveLength(2);
  });

  it("preserva a ordem de entrada dentro de cada grupo", () => {
    const groups = groupByInstitution([
      account("primeiro", "Banco"),
      account("segundo", "Banco"),
      account("terceiro", "Banco"),
    ]);

    expect(groups[0]?.items.map((item) => item.name)).toEqual([
      "primeiro",
      "segundo",
      "terceiro",
    ]);
  });

  it("devolve lista vazia para entrada vazia", () => {
    expect(groupByInstitution([])).toEqual([]);
  });
});
