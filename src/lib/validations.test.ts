import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  accountSchema,
  cardPurchaseSchema,
  categorySchema,
  confirmOccurrenceSchema,
  debtSchema,
  debtSettlementSchema,
  invoicePaymentSchema,
  loginSchema,
  passwordChangeSchema,
  personSchema,
  recurringExpenseSchema,
  registerSchema,
  transactionSchema,
  PASSWORD_MIN_LENGTH,
  TEXT_LIMITS,
} from "./validations";

/**
 * Este módulo é fonte única do formulário e das ferramentas MCP de escrita: o
 * que passa aqui vira linha no banco por dois caminhos diferentes. As regras que
 * mais importam — teto de texto, valor positivo, data inexistente, destino
 * exclusivo do recorrente — são exatamente as que o typecheck não vê.
 *
 * A tabela abaixo é por schema para que um campo novo sem caso apareça como
 * lacuna óbvia, não como linha a mais no meio de um `describe` de 400 linhas.
 */

const UUID = "9f8b2c1e-3d4a-4b5c-8e7f-0a1b2c3d4e5f";
const OTHER_UUID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

interface SchemaCase {
  name: string;
  schema: z.ZodType;
  valid: unknown;
  /** Cada recusa nomeia o campo que o formulário deve destacar. */
  invalid: Array<{ why: string; input: unknown; field?: string }>;
}

const transactionValid = {
  accountId: UUID,
  categoryId: OTHER_UUID,
  type: "EXPENSE",
  amount: 10,
  currency: "BRL",
  date: "2026-08-26",
  description: "Mercado",
  manualFxRate: null,
};

const cardPurchaseValid = {
  creditCardId: UUID,
  categoryId: null,
  description: "Geladeira",
  amount: 3000,
  currency: "BRL",
  date: "2026-08-26",
  installments: 10,
  manualFxRate: null,
};

const recurringValid = {
  description: "Aluguel",
  amount: 2000,
  currency: "BRL",
  frequency: "MONTHLY",
  dueDay: 5,
  isEstimated: false,
  startDate: "2026-01-05",
  endDate: null,
  categoryId: UUID,
  accountId: OTHER_UUID,
  creditCardId: null,
};

const debtValid = {
  personId: UUID,
  categoryId: OTHER_UUID,
  type: "LENT",
  description: "Empréstimo",
  amount: 500,
  currency: "BRL",
  accountId: UUID,
  date: "2026-08-01",
  dueDate: null,
  manualFxRate: null,
};

const CASES: SchemaCase[] = [
  {
    name: "loginSchema",
    schema: loginSchema,
    valid: { email: "a@b.com", password: "x" },
    invalid: [
      { why: "email malformado", input: { email: "a@", password: "x" }, field: "email" },
      { why: "senha vazia", input: { email: "a@b.com", password: "" }, field: "password" },
    ],
  },
  {
    name: "registerSchema",
    schema: registerSchema,
    valid: { name: "Thiago", email: "a@b.com", password: "x".repeat(PASSWORD_MIN_LENGTH) },
    invalid: [
      {
        why: "senha abaixo da política",
        input: { name: "T", email: "a@b.com", password: "x".repeat(PASSWORD_MIN_LENGTH - 1) },
        field: "password",
      },
      {
        why: "nome acima do teto da coluna",
        input: {
          name: "x".repeat(TEXT_LIMITS.name + 1),
          email: "a@b.com",
          password: "x".repeat(PASSWORD_MIN_LENGTH),
        },
        field: "name",
      },
    ],
  },
  {
    name: "passwordChangeSchema",
    schema: passwordChangeSchema,
    valid: { currentPassword: "antiga", newPassword: "n".repeat(12), confirmPassword: "n".repeat(12) },
    invalid: [
      {
        why: "confirmação diferente",
        input: { currentPassword: "a", newPassword: "n".repeat(12), confirmPassword: "outra" },
        field: "confirmPassword",
      },
      {
        why: "nova igual à atual",
        input: {
          currentPassword: "n".repeat(12),
          newPassword: "n".repeat(12),
          confirmPassword: "n".repeat(12),
        },
        field: "newPassword",
      },
    ],
  },
  {
    name: "accountSchema",
    schema: accountSchema,
    valid: { name: "Conta", type: "CHECKING", institution: null, currency: "BRL", initialBalance: 0 },
    invalid: [
      {
        why: "tipo fora do enum",
        input: { name: "Conta", type: "POUPANCINHA", currency: "BRL" },
        field: "type",
      },
      {
        why: "moeda fora da lista",
        input: { name: "Conta", type: "CHECKING", currency: "JPY" },
        field: "currency",
      },
      { why: "nome em branco", input: { name: "   ", type: "CHECKING", currency: "BRL" }, field: "name" },
    ],
  },
  {
    name: "categorySchema",
    schema: categorySchema,
    valid: { name: "Mercado", color: "#123abc", icon: null, parentId: null },
    invalid: [
      { why: "cor sem #", input: { name: "Mercado", color: "123abc" }, field: "color" },
      { why: "parentId não-uuid", input: { name: "Mercado", parentId: "1" }, field: "parentId" },
    ],
  },
  {
    name: "transactionSchema",
    schema: transactionSchema,
    valid: transactionValid,
    invalid: [
      { why: "valor zero", input: { ...transactionValid, amount: 0 }, field: "amount" },
      { why: "valor negativo", input: { ...transactionValid, amount: -1 }, field: "amount" },
      {
        why: "31 de fevereiro",
        input: { ...transactionValid, date: "2026-02-31" },
        field: "date",
      },
      {
        why: "descrição acima do teto da coluna",
        input: { ...transactionValid, description: "x".repeat(TEXT_LIMITS.description + 1) },
        field: "description",
      },
      {
        why: "taxa manual negativa",
        input: { ...transactionValid, manualFxRate: -1 },
        field: "manualFxRate",
      },
    ],
  },
  {
    name: "cardPurchaseSchema",
    schema: cardPurchaseSchema,
    valid: cardPurchaseValid,
    invalid: [
      {
        why: "parcelas fracionárias",
        input: { ...cardPurchaseValid, installments: 2.5 },
        field: "installments",
      },
      {
        why: "parcelas acima do teto",
        input: { ...cardPurchaseValid, installments: 121 },
        field: "installments",
      },
      { why: "cartão não-uuid", input: { ...cardPurchaseValid, creditCardId: "x" }, field: "creditCardId" },
    ],
  },
  {
    name: "recurringExpenseSchema",
    schema: recurringExpenseSchema,
    valid: recurringValid,
    invalid: [
      {
        why: "sem destino",
        input: { ...recurringValid, accountId: null, creditCardId: null },
        field: "accountId",
      },
      {
        why: "conta e cartão ao mesmo tempo",
        input: { ...recurringValid, creditCardId: UUID },
        field: "accountId",
      },
      { why: "dia 32", input: { ...recurringValid, dueDay: 32 }, field: "dueDay" },
      {
        why: "categoria ausente — aqui ela é obrigatória",
        input: { ...recurringValid, categoryId: null },
        field: "categoryId",
      },
    ],
  },
  {
    name: "confirmOccurrenceSchema",
    schema: confirmOccurrenceSchema,
    valid: { amount: 10, date: "2026-08-26", manualFxRate: null },
    invalid: [{ why: "valor zero", input: { amount: 0, date: "2026-08-26" }, field: "amount" }],
  },
  {
    name: "invoicePaymentSchema",
    schema: invoicePaymentSchema,
    valid: { accountId: UUID, date: "2026-08-26", manualFxRate: null },
    invalid: [
      { why: "conta ausente", input: { date: "2026-08-26" }, field: "accountId" },
      { why: "data inválida", input: { accountId: UUID, date: "26/08/2026" }, field: "date" },
    ],
  },
  {
    name: "personSchema",
    schema: personSchema,
    valid: { name: "Maria", notes: null },
    invalid: [
      {
        why: "notas acima do teto da coluna",
        input: { name: "Maria", notes: "x".repeat(TEXT_LIMITS.notes + 1) },
        field: "notes",
      },
    ],
  },
  {
    name: "debtSchema",
    schema: debtSchema,
    valid: debtValid,
    invalid: [
      { why: "tipo fora do enum", input: { ...debtValid, type: "OWED" }, field: "type" },
      {
        why: "categoria ausente — na dívida ela é o motivo, e é obrigatória",
        input: { ...debtValid, categoryId: null },
        field: "categoryId",
      },
    ],
  },
  {
    name: "debtSettlementSchema",
    schema: debtSettlementSchema,
    valid: {
      amount: 100,
      currency: "BRL",
      accountId: UUID,
      date: "2026-08-26",
      categoryId: null,
      description: null,
      manualFxRate: null,
      manualDebtFxRate: null,
    },
    invalid: [
      {
        why: "segunda taxa negativa",
        input: {
          amount: 100,
          currency: "BRL",
          accountId: UUID,
          date: "2026-08-26",
          manualDebtFxRate: -1,
        },
        field: "manualDebtFxRate",
      },
    ],
  },
];

describe.each(CASES)("$name", (testCase) => {
  it("aceita a entrada mínima válida", () => {
    const result = testCase.schema.safeParse(testCase.valid);

    expect(result.error?.issues, `recusou o caso válido`).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it.each(testCase.invalid)("recusa: $why", ({ input, field }) => {
    const result = testCase.schema.safeParse(input);

    expect(result.success).toBe(false);

    if (field) {
      const paths = result.error?.issues.map((issue) => issue.path.join(".")) ?? [];

      expect(paths, `nenhuma issue apontou ${field}`).toContain(field);
    }
  });
});

describe("normalização de texto opcional", () => {
  it("grava null em vez de string vazia", () => {
    // O banco tem CHECK exigindo NULL ou conteúdo: "" viraria ruído nos agrupamentos.
    expect(personSchema.parse({ name: "Maria", notes: "   " }).notes).toBeNull();
    expect(personSchema.parse({ name: "Maria" }).notes).toBeNull();
  });

  it("apara o texto antes de gravar", () => {
    expect(personSchema.parse({ name: "  Maria  " }).name).toBe("Maria");
    expect(personSchema.parse({ name: "Maria", notes: "  nota  " }).notes).toBe("nota");
  });

  it('trata o "" do Select limpo como ausência de id', () => {
    expect(categorySchema.parse({ name: "Mercado", parentId: "" }).parentId).toBeNull();
  });
});
