import type { AgentScope } from "@/lib/agentScopes";

/**
 * Qual ferramenta exige qual escopo.
 *
 * Vive aqui, e não em `src/lib/agentScopes.ts`, porque o domínio não sabe que
 * existem ferramentas. `scopes.test.ts` afirma que este mapa e o registro
 * cobrem o mesmo conjunto de nomes, o que impede uma ferramenta nova de entrar
 * sem escopo e rodar aberta.
 */

export const READ_TOOLS = [
  "get_month_summary",
  "get_open_invoices",
  "get_debts_by_category",
  "get_balance_projection",
  "list_accounts",
  "list_transactions",
  "list_credit_cards",
  "list_card_invoices",
  "list_invoice_items",
  "list_debts",
  "get_debt_detail",
  "get_people_overview",
  "list_recurring",
  "list_pending_occurrences",
  "list_categories",
] as const;

export const WRITE_TOOLS = {
  create_transaction: "transactions:write",
  update_transaction: "transactions:write",
  delete_transaction: "transactions:write",

  create_card_purchase: "cards:write",
  update_card_purchase: "cards:write",
  delete_card_purchase: "cards:write",

  pay_invoice: "invoices:pay",
  undo_invoice_payment: "invoices:pay",

  create_debt: "debts:write",
  update_debt: "debts:write",
  settle_debt: "debts:write",
  delete_settlement: "debts:write",

  create_recurring: "recurring:write",
  update_recurring: "recurring:write",
  delete_recurring: "recurring:write",
  set_recurring_active: "recurring:write",
  confirm_pending: "recurring:write",
  materialize_recurring: "recurring:write",
} as const satisfies Record<string, AgentScope>;

/**
 * Remoções em cascata. Todas exigem `destructive:write` **e** a confirmação em
 * duas fases: o escopo autoriza, a confirmação garante que o dano foi visto.
 */
export const DESTRUCTIVE_TOOLS = {
  delete_account: "destructive:write",
  delete_credit_card: "destructive:write",
  delete_person: "destructive:write",
  delete_category: "destructive:write",
  delete_debt: "destructive:write",
} as const satisfies Record<string, AgentScope>;

export const TOOL_SCOPES: Record<string, AgentScope> = {
  ...Object.fromEntries(READ_TOOLS.map((tool) => [tool, "finance:read" as AgentScope])),
  ...WRITE_TOOLS,
  ...DESTRUCTIVE_TOOLS,
};

export function scopeForTool(tool: string): AgentScope | undefined {
  return TOOL_SCOPES[tool];
}
