import { describe, expect, it } from "vitest";
import { DebtStatus, DebtType } from "@prisma/client";

import {
  DEBT_STATUS_CODES,
  DEBT_STATUS_COLORS,
  DEBT_STATUS_LABELS,
  DEBT_TYPE_CODES,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_OPTIONS,
  availableDebtTypeOptions,
} from "./debtTypes";

/**
 * O módulo de rótulos é client-safe e não importa o Prisma, então a
 * correspondência com os enums do schema não é garantida pelo compilador —
 * é garantida aqui.
 */
describe("correspondência com os enums do schema", () => {
  it("cobre exatamente os tipos de dívida", () => {
    expect([...DEBT_TYPE_CODES].sort()).toEqual(Object.values(DebtType).sort());
  });

  it("cobre exatamente as situações de dívida", () => {
    expect([...DEBT_STATUS_CODES].sort()).toEqual(Object.values(DebtStatus).sort());
  });

  it("tem rótulo e cor para cada código", () => {
    for (const code of DEBT_TYPE_CODES) {
      expect(DEBT_TYPE_LABELS[code]).toBeTruthy();
    }

    for (const code of DEBT_STATUS_CODES) {
      expect(DEBT_STATUS_LABELS[code]).toBeTruthy();
      expect(DEBT_STATUS_COLORS[code]).toBeTruthy();
    }
  });

  it("expõe as opções de Select na ordem dos códigos", () => {
    expect(DEBT_TYPE_OPTIONS.map((option) => option.value)).toEqual([...DEBT_TYPE_CODES]);
  });

  it("oferece apenas dívida emprestada quando não há conta", () => {
    expect(availableDebtTypeOptions(false).map((option) => option.value)).toEqual(["LENT"]);
    expect(availableDebtTypeOptions(true)).toBe(DEBT_TYPE_OPTIONS);
  });
});
