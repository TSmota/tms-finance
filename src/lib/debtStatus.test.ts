import { describe, expect, it } from "vitest";

import { deriveDebtStatus } from "./debtStatus";
import { money } from "./money";

/**
 * O status da dívida é **derivado**, nunca gravado à mão (RN-05.4).
 *
 * O que estes testes protegem: a situação sair sempre da comparação entre
 * restante e total. Um status gravado como campo independente pode contradizer
 * o `remainingAmount` que a mesma transação acabou de atualizar.
 */

describe("situação derivada da dívida", () => {
  it("restante igual ao total é dívida em aberto", () => {
    expect(deriveDebtStatus("200.00", "200.00")).toBe("PENDING");
  });

  it("restante zerado é dívida quitada", () => {
    expect(deriveDebtStatus("200.00", "0.00")).toBe("PAID");
  });

  it("restante entre zero e o total é quitação parcial", () => {
    expect(deriveDebtStatus("200.00", "120.00")).toBe("PARTIALLY_PAID");
    expect(deriveDebtStatus("200.00", "199.99")).toBe("PARTIALLY_PAID");
    expect(deriveDebtStatus("200.00", "0.01")).toBe("PARTIALLY_PAID");
  });

  it("não se engana com centavos", () => {
    // 0,1 + 0,2 em float daria 0,30000000000000004 e romperia a igualdade.
    expect(deriveDebtStatus("0.30", money("0.10").plus("0.20"))).toBe("PENDING");
  });

  it("trata restante negativo como quitada, em vez de estado inválido", () => {
    expect(deriveDebtStatus("200.00", "-0.01")).toBe("PAID");
  });

  it("trata restante acima do total como em aberto", () => {
    expect(deriveDebtStatus("200.00", "250.00")).toBe("PENDING");
  });
});
