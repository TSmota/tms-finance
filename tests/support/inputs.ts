import type {
  AccountInput,
  CardPurchaseInput,
  CategoryInput,
  CreditCardInput,
  DebtInput,
  DebtSettlementInput,
  RecurringExpenseInput,
  TransactionInput,
} from "@/lib/validations";

/**
 * Payloads válidos mínimos, um por schema, com override do que o teste quer
 * declarar.
 *
 * A divisão com `factories.ts` é a fronteira do banco: fábrica **escreve** uma
 * linha, builder daqui só **monta o payload** que vai a um serviço ou a uma
 * ferramenta MCP.
 *
 * Todos são tipados por `@/lib/validations`, que o AGENTS.md define como fonte
 * única. Isso não é decoração: dois builders locais se tipavam por
 * `Parameters<typeof createX>[1]`, e por isso não quebravam quando o schema
 * ganhava campo — exatamente o aviso que o teste existe para dar.
 */

export function accountInput(overrides: Partial<AccountInput> = {}): AccountInput {
  return {
    name: "Conta",
    type: "CHECKING",
    institution: null,
    currency: "BRL",
    initialBalance: 0,
    ...overrides,
  };
}

export function categoryInput(overrides: Partial<CategoryInput> = {}): CategoryInput {
  return {
    name: "Categoria",
    color: "#40c057",
    icon: null,
    parentId: null,
    ...overrides,
  };
}

export function creditCardInput(overrides: Partial<CreditCardInput> = {}): CreditCardInput {
  return {
    name: "Cartão",
    institution: null,
    closingDay: 20,
    dueDay: 5,
    currency: "BRL",
    creditLimit: null,
    defaultPaymentAccountId: null,
    ...overrides,
  };
}

export function transactionInput(
  overrides: Partial<TransactionInput> & { accountId: string },
): TransactionInput {
  return {
    categoryId: null,
    type: "EXPENSE",
    amount: 100,
    currency: "BRL",
    date: "2026-08-15",
    description: "Lançamento de teste",
    manualFxRate: null,
    ...overrides,
  };
}

export function cardPurchaseInput(
  overrides: Partial<CardPurchaseInput> & { creditCardId: string },
): CardPurchaseInput {
  return {
    categoryId: null,
    description: "Compra de teste",
    amount: 100,
    currency: "BRL",
    date: "2026-08-15",
    installments: 1,
    manualFxRate: null,
    ...overrides,
  };
}

export function debtInput(
  overrides: Partial<DebtInput> & { personId: string; categoryId: string; accountId: string },
): DebtInput {
  return {
    type: "LENT",
    description: "Empréstimo de teste",
    amount: 200,
    currency: "BRL",
    date: "2026-08-06",
    dueDate: null,
    manualFxRate: null,
    ...overrides,
  };
}

export function debtSettlementInput(
  overrides: Partial<DebtSettlementInput> & { accountId: string },
): DebtSettlementInput {
  return {
    amount: 80,
    currency: "BRL",
    date: "2026-08-16",
    categoryId: null,
    description: null,
    manualFxRate: null,
    ...overrides,
  };
}

export function recurringExpenseInput(
  overrides: Partial<RecurringExpenseInput> & { categoryId: string },
): RecurringExpenseInput {
  return {
    description: "Assinatura de teste",
    amount: 39.9,
    currency: "BRL",
    frequency: "MONTHLY",
    dueDay: 10,
    isEstimated: false,
    startDate: "2026-08-01",
    endDate: null,
    accountId: null,
    creditCardId: null,
    ...overrides,
  };
}
