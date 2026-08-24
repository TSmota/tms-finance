import type { McpServer } from "@modelcontextprotocol/server";

import { deleteAccount } from "@/lib/accounts";
import { deleteCategory } from "@/lib/categories";
import { deleteCreditCard } from "@/lib/creditCards";
import { deleteDebt } from "@/lib/debts";
import { deletePerson } from "@/lib/people";
import { idArgs } from "@/mcp/args";
import { REVALIDATE, runDestructiveTool } from "@/mcp/guard";

/**
 * Remoções em cascata. Escopo `destructive:write` **e** confirmação em duas
 * fases: o escopo autoriza, a confirmação garante que o dano foi visto.
 *
 * A primeira chamada nunca executa: devolve o impacto medido e um
 * `requestState` assinado, e a pergunta vai ao cliente.
 *
 * As cinco remoções em cascata do domínio estão todas cobertas, e é a mecânica
 * de confirmação que torna expô-las defensável: `deleteAccount` é um
 * `deleteMany` sem guarda sobre uma FK `onDelete: Cascade`.
 */

export function registerDestructiveTools(server: McpServer): void {
  server.registerTool(
    "delete_account",
    {
      title: "Remover conta",
      description:
        "Remove uma conta bancária ou carteira. ATENÇÃO: apaga em cascata TODOS os " +
        "lançamentos e gastos recorrentes da conta — é a remoção mais destrutiva do " +
        "sistema e não tem nenhuma trava de negócio. A primeira chamada devolve o " +
        "impacto medido e pede confirmação; leia os números antes de confirmar.",
      inputSchema: idArgs,
    },
    async (args, ctx) =>
      runDestructiveTool({
        ctx,
        tool: "delete_account",
        target: "account",
        input: args,
        schema: idArgs,
        run: (agent, id) => deleteAccount(agent.userId, id),
        revalidatePaths: REVALIDATE.setup,
      }),
  );

  server.registerTool(
    "delete_credit_card",
    {
      title: "Remover cartão",
      description:
        "Remove um cartão com suas faturas, lançamentos e recorrentes em cascata. " +
        "Recusa quando há fatura paga: o histórico de pagamentos seria perdido e a " +
        "transação de pagamento na conta ficaria órfã.",
      inputSchema: idArgs,
    },
    async (args, ctx) =>
      runDestructiveTool({
        ctx,
        tool: "delete_credit_card",
        target: "credit_card",
        input: args,
        schema: idArgs,
        run: (agent, id) => deleteCreditCard(agent.userId, id),
        revalidatePaths: REVALIDATE.setup,
      }),
  );

  server.registerTool(
    "delete_person",
    {
      title: "Remover pessoa",
      description:
        "Remove uma pessoa e, em cascata, suas dívidas já quitadas. Recusa quando há " +
        "posição em aberto. Os lançamentos das dívidas removidas permanecem no fluxo " +
        "de caixa com sua categoria, mas perdem o agrupamento por dívida.",
      inputSchema: idArgs,
    },
    async (args, ctx) =>
      runDestructiveTool({
        ctx,
        tool: "delete_person",
        target: "person",
        input: args,
        schema: idArgs,
        run: (agent, id) => deletePerson(agent.userId, id),
        revalidatePaths: REVALIDATE.people,
      }),
  );

  server.registerTool(
    "delete_category",
    {
      title: "Remover categoria",
      description:
        "Remove a categoria e suas subcategorias em cascata. Os lançamentos que a " +
        'usavam passam a contar como "Sem categoria". Recusa quando um gasto ' +
        "recorrente ou uma dívida aponta para ela, porque lá a categoria é " +
        "obrigatória.",
      inputSchema: idArgs,
    },
    async (args, ctx) =>
      runDestructiveTool({
        ctx,
        tool: "delete_category",
        target: "category",
        input: args,
        schema: idArgs,
        run: (agent, id) => deleteCategory(agent.userId, id),
        revalidatePaths: REVALIDATE.setup,
      }),
  );

  server.registerTool(
    "delete_debt",
    {
      title: "Remover dívida",
      description:
        "Remove a dívida com todas as suas movimentações, revertendo os saldos das " +
        "contas afetadas. O caixa fica coerente; o que se perde é o histórico do " +
        "empréstimo. Para apagar só uma amortização use delete_settlement.",
      inputSchema: idArgs,
    },
    async (args, ctx) =>
      runDestructiveTool({
        ctx,
        tool: "delete_debt",
        target: "debt",
        input: args,
        schema: idArgs,
        run: (agent, id) => deleteDebt(agent.userId, id),
        revalidatePaths: REVALIDATE.debts,
      }),
  );
}
