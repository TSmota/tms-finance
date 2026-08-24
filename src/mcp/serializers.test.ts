import { describe, expect, it } from "vitest";

import * as dto from "@/mcp/serializers";

/**
 * Invariantes das projeções, verificadas por varredura em vez de campo a campo.
 *
 * Enumerar campos testaria o que já está escrito; varrer testa o que *pode ser
 * escrito amanhã*. Um `select` que ganha campo novo, ou um serializer que passa
 * o objeto do Prisma adiante por descuido, cai aqui — que é o ponto.
 */

/** Todos os pares chave/valor da árvore, com o caminho, para mensagem útil. */
function walk(value: unknown, path = "$"): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => walk(item, `${path}[${index}]`));
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => [
      [`${path}.${key}`, inner] as [string, unknown],
      ...walk(inner, `${path}.${key}`),
    ]);
  }

  return [];
}

/** Campos que nunca podem sair, mesmo por acidente. */
const FORBIDDEN = /(^|\.)(userId|user_id|passwordHash|password_hash|email|emailVerified|sessionToken|refresh_token|access_token|id_token)$/;

/** Nome de campo que carrega dinheiro. `exchange_rate` tem 4 casas, à parte. */
const MONETARY = /(amount|balance|total|limit|receivable|payable|net|outstanding)$/;

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertNoLeaks(payload: unknown): void {
  for (const [path] of walk(payload)) {
    const leaf = path.split(".").pop() ?? "";

    expect(FORBIDDEN.test(leaf), `campo proibido vazou em ${path}`).toBe(false);
  }
}

function assertMoneyIsString(payload: unknown): void {
  for (const [path, value] of walk(payload)) {
    const leaf = path.split(".").pop() ?? "";

    if (!MONETARY.test(leaf) || value === null || typeof value === "object") {
      continue;
    }

    expect(typeof value, `${path} deveria ser string, veio ${typeof value}`).toBe("string");
    expect(String(value), `${path} deveria ter 2 casas`).toMatch(/^-?\d+\.\d{2}$/);
  }
}

const BRL = "BRL" as const;

const monthSummary = {
  income: 5000,
  expenses: 3210.5,
  net: 1789.5,
  cardSpending: 1200.33,
  invoicePayments: 900,
  byCategory: [{ id: "c1", name: "Mercado", color: "#fff", value: 810.1 }],
  spendingTotal: 3510.83,
  complete: false,
};

const account = {
  id: "a1",
  name: "Conta",
  type: "CHECKING" as const,
  institution: null,
  currency: BRL,
  balance: 1234.5,
  convertedBalance: 1234.5,
  converted: true,
};

const transaction = {
  id: "t1",
  description: "Mercado",
  type: "EXPENSE" as const,
  status: "CONFIRMED" as const,
  date: new Date("2026-08-21T00:00:00Z"),
  amount: 99.9,
  currency: BRL,
  convertedAmount: 99.9,
  exchangeRate: 1,
  accountId: "a1",
  accountName: "Conta",
  accountCurrency: BRL,
  categoryId: "c1",
  categoryName: "Mercado",
  categoryColor: "#fff",
  isEstimated: false,
};

const debt = {
  id: "d1",
  type: "LENT" as const,
  status: "PARTIALLY_PAID" as const,
  description: "Empréstimo",
  originalAmount: 1000,
  remainingAmount: 400,
  settledAmount: 600,
  currency: BRL,
  dueDate: new Date("2026-09-01T00:00:00Z"),
  personId: "p1",
  personName: "João",
  categoryId: "c1",
  categoryName: "Mercado",
  categoryColor: "#fff",
  settlementCount: 2,
  originAccountId: "a1",
  originDate: new Date("2026-07-01T00:00:00Z"),
  createdAt: new Date("2026-07-01T00:00:00Z"),
};

/** Uma amostra de cada projeção, para a varredura ter o que varrer. */
const samples: Array<[string, unknown]> = [
  ["monthSummary", dto.monthSummaryDto(monthSummary, BRL)],
  [
    "openInvoices",
    dto.openInvoicesDto(
      { total: 1500, count: 2, nextDueDate: new Date("2026-09-05T00:00:00Z"), complete: true },
      BRL,
    ),
  ],
  [
    "debtsByCategory",
    dto.debtsByCategoryDto(
      {
        receivable: [{ id: "c1", name: "Mercado", color: null, value: 400 }],
        payable: [],
        receivableTotal: 400,
        payableTotal: 0,
        complete: true,
      },
      BRL,
    ),
  ],
  [
    "projection",
    dto.balanceProjectionDto(
      {
        currentBalance: 1000,
        pendingIncome: 200,
        pendingExpenses: 300,
        unpaidInvoices: 150,
        projectedBalance: 750,
        pendingCount: 3,
        horizon: new Date("2026-09-01T00:00:00Z"),
        complete: true,
      },
      BRL,
    ),
  ],
  ["accounts", dto.accountsDto({ accounts: [account], netWorth: 1234.5, netWorthComplete: true }, BRL)],
  ["transactions", dto.transactionsDto([transaction])],
  ["debts", dto.debtsDto([debt])],
  ["debtDetail", dto.debtDetailDto({ debt, movements: [] })],
  [
    "people",
    dto.peopleOverviewDto(
      {
        people: [
          {
            id: "p1",
            name: "João",
            notes: null,
            receivable: 400,
            payable: 0,
            net: 400,
            openDebts: 1,
            complete: true,
          },
        ],
        totalReceivable: 400,
        totalPayable: 0,
        totalNet: 400,
        complete: true,
      },
      BRL,
    ),
  ],
  ["categories", dto.categoriesDto([{ id: "c1", name: "Mercado", color: "#fff", icon: null, subcategories: [{ id: "c2", name: "Feira", color: null, icon: null }] }])],
];

describe("projeções para o agente", () => {
  for (const [name, payload] of samples) {
    it(`${name}: não vaza identificador de usuário nem credencial`, () => {
      assertNoLeaks(payload);
    });

    it(`${name}: entrega dinheiro como string de 2 casas`, () => {
      assertMoneyIsString(payload);
    });
  }

  it("descarta cor de categoria — é dado de renderização", () => {
    const payload = dto.transactionsDto([transaction]);

    for (const [path] of walk(payload)) {
      expect(path).not.toMatch(/color/i);
    }
  });

  it("entrega datas como YYYY-MM-DD, sem fuso", () => {
    const [row] = dto.transactionsDto([transaction]);

    expect(row.date).toBe("2026-08-21");
    expect(row.date).toMatch(CALENDAR_DATE);
  });

  /**
   * A UI já precisa rotular a diferença entre fluxo de caixa e gasto por
   * categoria. Aqui a exigência é maior: o agente escreve prosa sobre os
   * números, e dois valores diferentes com o mesmo nome produziriam uma frase
   * errada.
   */
  it("nomeia fluxo de caixa e gasto por categoria de formas distintas", () => {
    const payload = dto.monthSummaryDto(monthSummary, BRL);

    expect(payload.cash_flow.cash_out.amount).toBe("3210.50");
    expect(payload.spending.total.amount).toBe("3510.83");
    expect(payload.cash_flow.cash_out.amount).not.toBe(payload.spending.total.amount);
    expect(payload.relation).toContain("cash_out");
  });

  it("propaga complete: false para o agente relatar a incerteza", () => {
    expect(dto.monthSummaryDto(monthSummary, BRL).complete).toBe(false);
  });

  it("marca conta sem cotação com null em vez de repetir o saldo nativo", () => {
    const payload = dto.accountsDto(
      {
        accounts: [{ ...account, currency: "USD", converted: false, convertedBalance: 0 }],
        netWorth: 0,
        netWorthComplete: false,
      },
      BRL,
    );

    expect(payload.accounts[0].balance_in_base_currency).toBeNull();
    expect(payload.net_worth.complete).toBe(false);
  });
});
