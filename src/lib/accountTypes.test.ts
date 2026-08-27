import { describe, expect, it } from "vitest";
import { AccountType } from "@prisma/client";

import { ACCOUNT_TYPE_CODES, ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from "./accountTypes";

describe("tipos de conta", () => {
  it("cobre exatamente o enum AccountType do Prisma", () => {
    expect([...ACCOUNT_TYPE_CODES].sort()).toEqual(Object.values(AccountType).sort());
  });

  it("tem rótulo em pt-BR para cada tipo", () => {
    for (const code of ACCOUNT_TYPE_CODES) {
      expect(ACCOUNT_TYPE_LABELS[code]).toBeTruthy();
    }
  });

  it("preserva a ordem de exibição, com conta corrente primeiro", () => {
    expect(ACCOUNT_TYPES[0]?.value).toBe("CHECKING");
  });
});
