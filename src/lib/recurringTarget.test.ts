import { describe, expect, it } from "vitest";

import { joinTarget, splitTarget } from "./recurringTarget";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const CARD = "22222222-2222-4222-8222-222222222222";

describe("destino da recorrência", () => {
  it("vai e volta preservando a conta", () => {
    expect(splitTarget(joinTarget(ACCOUNT, null))).toEqual({
      accountId: ACCOUNT,
      creditCardId: null,
    });
  });

  it("vai e volta preservando o cartão", () => {
    expect(splitTarget(joinTarget(null, CARD))).toEqual({
      accountId: null,
      creditCardId: CARD,
    });
  });

  it("destino vazio não escolhe nenhum dos dois", () => {
    expect(joinTarget(null, null)).toBe("");
    expect(splitTarget("")).toEqual({ accountId: null, creditCardId: null });
  });

  it("a conta tem precedência quando ambos vêm preenchidos", () => {
    // Estado impossível no banco (há CHECK de XOR); aqui só não pode explodir.
    expect(joinTarget(ACCOUNT, CARD)).toBe(`account:${ACCOUNT}`);
  });

  it("valor desconhecido não é interpretado como id", () => {
    expect(splitTarget("qualquer-coisa")).toEqual({ accountId: null, creditCardId: null });
  });
});
