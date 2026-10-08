import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { defineTool } from "@/mcp/define";
import { noArgs, idArgs, idArg, competencyArgs, toCompetency } from "@/mcp/args";
import { transferSchema, savingsGoalSchema, savingsEntrySchema, batchPaymentSchema } from "@/lib/validations";
import * as transfers from "@/lib/transfers";
import * as goals from "@/lib/savingsGoals";
import * as payments from "@/lib/batchPayments";
import * as history from "@/lib/dashboardHistory";
import { transferDto, savingsGoalDto, payableDto, historyDto, netWorthDto } from "@/mcp/serializers";

export function registerRoadmapTools(server: McpServer): void {
  defineTool(server, "list_transfers", {
    title: "Listar transferências", description: "Até 200 transferências recentes, sem efeito em receitas ou despesas.",
    schema: noArgs, run: (agent) => transfers.listTransfers(agent.userId), serialize: (rows) => rows.map(transferDto),
  });
  defineTool(server, "list_savings_goals", {
    title: "Listar metas", description: "Metas com progresso manual e histórico; não movimentam contas.",
    schema: noArgs, run: (agent) => goals.listSavingsGoals(agent.userId), serialize: (rows) => rows.map(savingsGoalDto),
  });
  defineTool(server, "list_payables", {
    title: "Listar pagamentos pendentes", description: "Faturas abertas e dívidas a pagar, com valores para prévia do lote.",
    schema: noArgs, run: (agent) => payments.listPayables(agent.userId), serialize: (rows) => rows.map(payableDto),
  });
  defineTool(server, "get_monthly_history", {
    title: "Histórico de doze meses", description: "Fluxo de caixa na moeda-base; complete indica disponibilidade das cotações.",
    schema: competencyArgs, run: (agent, input) => {
      const period = toCompetency(input.month); return history.getMonthlyHistory(agent.userId, period.year, period.month, agent.baseCurrency);
    }, serialize: (rows, agent) => historyDto(rows, agent.baseCurrency),
  });
  defineTool(server, "get_net_worth", {
    title: "Patrimônio líquido", description: "Contas + recebíveis - dívidas a pagar - faturas abertas.",
    schema: noArgs, run: (agent) => history.getNetWorth(agent.userId, agent.baseCurrency), serialize: (row, agent) => netWorthDto(row, agent.baseCurrency),
  });
  defineTool(server, "create_transfer", {
    title: "Criar transferência", description: "Transfere entre duas contas próprias da mesma moeda atomicamente.",
    schema: transferSchema, run: (agent, input) => transfers.createTransfer(agent.userId, input), serialize: transferDto,
    affected: (row) => [row.id], revalidates: "roadmap",
  });
  defineTool(server, "update_transfer", {
    title: "Editar transferência", description: "Substitui dados e corrige ambos os saldos atomicamente.",
    schema: z.object({ id: idArg, data: transferSchema }), run: (agent, input) => transfers.updateTransfer(agent.userId, input.id, input.data), serialize: transferDto,
    affected: (row) => [row.id], revalidates: "roadmap",
  });
  defineTool(server, "delete_transfer", {
    title: "Remover transferência", description: "Remove uma transferência e estorna ambos os saldos; reversível por recriação.",
    schema: idArgs, run: (agent, input) => transfers.deleteTransfer(agent.userId, input.id), serialize: () => ({ deleted: true }),
    affected: () => [], revalidates: "roadmap",
  });
  defineTool(server, "create_savings_goal", {
    title: "Criar meta", description: "Cria meta manual; moeda imutável, prazo opcional, progresso não afeta saldo.",
    schema: savingsGoalSchema, run: (agent, input) => goals.createSavingsGoal(agent.userId, input), serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id], revalidates: "roadmap",
  });
  defineTool(server, "update_savings_goal", {
    title: "Editar meta", description: "Substitui alvo, nome, prazo e pausa; mantém histórico e recalcula conclusão.",
    schema: z.object({ id: idArg, data: savingsGoalSchema }), run: (agent, input) => goals.updateSavingsGoal(agent.userId, input.id, input.data), serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id], revalidates: "roadmap",
  });
  defineTool(server, "add_savings_entry", {
    title: "Aporte ou retirada", description: "Registra progresso manual. Retirada não pode exceder aportes; meta pausada recusa.",
    schema: z.object({ id: idArg, data: savingsEntrySchema }), run: (agent, input) => goals.addSavingsEntry(agent.userId, input.id, input.data), serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id], revalidates: "roadmap",
  });
  defineTool(server, "pay_batch", {
    title: "Pagar lote", description: "Paga até 50 faturas/dívidas BORROWED na moeda da conta. Atomicidade total; expectedAmount deve vir da prévia. Reutilize requestId em retries do mesmo payload; após estorno, uma nova operação exige nova chave.",
    schema: batchPaymentSchema, run: (agent, input) => payments.payBatch(agent.userId, input), serialize: (ids) => ({ transaction_ids: ids }),
    affected: (ids) => ids, revalidates: "roadmap",
  });
}
