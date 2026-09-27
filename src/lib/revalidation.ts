/**
 * Telas afetadas por cada domínio de escrita.
 *
 * Fonte única para os dois caminhos de escrita do app: as server actions e as
 * ferramentas MCP. Duas listas espelhadas divergem sem ninguém notar, e o
 * sintoma é tela velha conforme quem escreveu — aí a tabela é uma só.
 *
 * Só dados: quem chama `revalidatePath` é a camada de action
 * (`src/actions/guard.ts`) e o seam do agente (`src/mcp/guard.ts`).
 *
 * O par `[path, type]` existe por causa das rotas dinâmicas: `revalidatePath`
 * exige `"page"` quando o caminho tem segmento entre colchetes.
 */

export type RevalidationTarget = readonly [path: string, type?: "page" | "layout"];

const PAYMENTS: RevalidationTarget = ["/dashboard/payments"];
const TRANSFERS: RevalidationTarget = ["/dashboard/transfers"];

const DASHBOARD: RevalidationTarget = ["/dashboard"];
const ACCOUNTS: RevalidationTarget = ["/dashboard/accounts"];
const CARDS: RevalidationTarget = ["/dashboard/cards"];
const CARD_DETAIL: RevalidationTarget = ["/dashboard/cards/[id]", "page"];
const CATEGORIES: RevalidationTarget = ["/dashboard/categories"];
const DEBTS: RevalidationTarget = ["/dashboard/debts"];
const DEBT_DETAIL: RevalidationTarget = ["/dashboard/debts/[id]", "page"];
const PEOPLE: RevalidationTarget = ["/dashboard/people"];
const RECURRING: RevalidationTarget = ["/dashboard/recurring"];
const TRANSACTIONS: RevalidationTarget = ["/dashboard/transactions"];

export const REVALIDATION_TARGETS = {
  roadmap: [["/dashboard", "layout"]],
  accounts: [PAYMENTS, TRANSFERS, DASHBOARD, ACCOUNTS, TRANSACTIONS],
  categories: [DASHBOARD, CATEGORIES, TRANSACTIONS],
  creditCards: [PAYMENTS, TRANSFERS, DASHBOARD, CARDS, CARD_DETAIL, TRANSACTIONS],
  cardPurchases: [PAYMENTS, TRANSFERS, DASHBOARD, CARDS, CARD_DETAIL, TRANSACTIONS],
  invoices: [PAYMENTS, TRANSFERS, DASHBOARD, CARDS, CARD_DETAIL, ACCOUNTS, TRANSACTIONS],
  transactions: [DASHBOARD, TRANSACTIONS, ACCOUNTS],
  debts: [PAYMENTS, TRANSFERS, DASHBOARD, DEBTS, DEBT_DETAIL, PEOPLE, ACCOUNTS, TRANSACTIONS, CARDS, CARD_DETAIL],
  people: [DASHBOARD, PEOPLE, DEBTS],
  recurring: [PAYMENTS, DASHBOARD, RECURRING, TRANSACTIONS, ACCOUNTS, CARDS, CARD_DETAIL],
  /**
   * Cadastros de base, para a remoção pelo agente: conta, categoria e cartão
   * saem por ferramentas distintas mas atingem as mesmas telas.
   */
  setup: [PAYMENTS, TRANSFERS, DASHBOARD, ACCOUNTS, CARDS, CARD_DETAIL, CATEGORIES, TRANSACTIONS],
  /**
   * A moeda base é lida por toda agregação: a troca invalida a subárvore
   * inteira, e não uma lista de telas.
   */
  settings: [["/dashboard", "layout"]],
} as const satisfies Record<string, readonly RevalidationTarget[]>;

export type RevalidationDomain = keyof typeof REVALIDATION_TARGETS;
