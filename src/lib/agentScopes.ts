/**
 * Vocabulário de escopos da superfície de agente.
 *
 * Módulo puro, sem import de runtime do Prisma, para poder entrar no bundle do
 * cliente. Aqui mora só a lista; o mapa de qual ferramenta exige qual escopo
 * vive em `src/mcp/scopes.ts`, porque é conhecimento da casca MCP.
 *
 * A lista é espelhada pelo CHECK `agent_tokens_scopes_known` na migration.
 * Acrescentar um escopo aqui sem acrescentar lá produz um token que o banco
 * recusa.
 */

export const AGENT_SCOPES = [
  /** Toda leitura e agregação. Nenhuma escrita. */
  "finance:read",
  /** Criar, editar e apagar lançamento de conta. */
  "transactions:write",
  /** Compra no cartão, inclusive parcelada. */
  "cards:write",
  /** Pagar e desfazer pagamento de fatura. */
  "invoices:pay",
  /** Criar dívida, amortizar, apagar amortização. */
  "debts:write",
  /** Recorrentes, materialização e confirmação de pendência. */
  "recurring:write",
  /**
   * Criar e editar conta, cartão, categoria e pessoa.
   *
   * Não conceder por padrão: criar conta ou cartão fixa a moeda, que é imutável
   * depois. É decisão de configuração, não de operação.
   */
  "setup:write",
  /**
   * Remoções em cascata. Sempre em duas fases, mesmo com o escopo concedido —
   * ver `src/mcp/confirm.ts`.
   */
  "destructive:write",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

const SCOPE_SET: ReadonlySet<string> = new Set(AGENT_SCOPES);

export function isAgentScope(value: unknown): value is AgentScope {
  return typeof value === "string" && SCOPE_SET.has(value);
}

/**
 * Filtra uma lista vinda do banco para os escopos que este build conhece.
 *
 * A coluna `scopes` é `TEXT[]`: o Prisma a tipa como `string[]` e não há enum
 * do Postgres para apoiar. Um deploy antigo lendo um token emitido por um
 * deploy novo veria escopo desconhecido — descartá-lo é a leitura segura,
 * porque escopo que este build não entende é escopo que ele não sabe aplicar.
 */
export function parseAgentScopes(values: readonly string[]): AgentScope[] {
  return values.filter(isAgentScope);
}
