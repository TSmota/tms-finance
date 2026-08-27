import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getAccountBalances } from "@/lib/accounts";
import { listCategoryTree } from "@/lib/categories";
import { listCreditCards } from "@/lib/creditCards";
import { getDebtDetail, listDebts } from "@/lib/debts";
import { DELETION_TARGETS, describeDeletionImpact } from "@/lib/deletionImpact";
import { listCardInvoices, listInvoiceItems } from "@/lib/invoices";
import { getPeopleOverview } from "@/lib/people";
import { getBalanceProjection } from "@/lib/projection";
import { listPendingOccurrences, listRecurringExpenses } from "@/lib/recurring";
import { getDebtsByCategory, getMonthSummary, getOpenInvoices } from "@/lib/reports";
import { listMonthTransactions, listRecentTransactions } from "@/lib/transactions";
import { DEBT_TYPE_CODES } from "@/lib/debtTypes";
import { competencyArgs, idArg, noArgs, toCompetency } from "@/mcp/args";
import { defineTool } from "@/mcp/define";
import * as dto from "@/mcp/serializers";

/**
 * Ferramentas de leitura. Todas exigem `finance:read` e nada mais.
 *
 * **Nenhuma leitura escreve no banco.** O painel materializa recorrentes
 * durante a renderização, o que é aceitável para um humano abrindo uma página.
 * Para um chamador de máquina que pode disparar cem leituras, escrita implícita
 * é armadilha: `get_balance_projection` expõe `pending_count` e o agente chama
 * `materialize_recurring` explicitamente, sob escopo de escrita.
 *
 * As `description` carregam as advertências de domínio: são o único lugar onde
 * o agente aprende que compra no cartão não sai da conta.
 */

const MONEY_WARNING =
  "Os valores vêm como string decimal. NÃO faça aritmética com eles: " +
  "use get_month_summary, get_balance_projection ou list_accounts, que já " +
  "trazem os totais convertidos para a moeda base.";

const listTransactionsArgs = z.object({
  /** Ausente junto com `recent` = mês corrente. */
  month: competencyArgs.shape.month,
  /** Ignora o mês e traz os N mais recentes. */
  recent: z.coerce.number().int().min(1).max(200).optional(),
});

const cardIdArgs = z.object({ credit_card_id: idArg });
const invoiceIdArgs = z.object({ invoice_id: idArg });
const debtIdArgs = z.object({ debt_id: idArg });

const listDebtsArgs = z.object({
  person_id: idArg.optional(),
  type: z.enum(DEBT_TYPE_CODES).optional(),
});

const deletionImpactArgs = z.object({
  target: z.enum(DELETION_TARGETS),
  id: idArg,
});

export function registerReadTools(server: McpServer): void {
  defineTool(server, "get_month_summary", {
    title: "Resumo do mês",
    description:
      "Fluxo de caixa e gasto por categoria de um mês. " +
      "ATENÇÃO: são duas visões diferentes e não somam a mesma coisa. " +
      "`cash_flow.cash_out` é o que saiu das contas, incluindo pagamento de fatura. " +
      "`spending.total` é onde o dinheiro foi gasto, incluindo compra no cartão pela " +
      "data da compra e excluindo pagamento de fatura (uma compra no cartão não sai " +
      "da conta). Nunca chame as duas de 'despesa'. " +
      "`complete: false` significa que faltou cotação de alguma moeda: relate a " +
      "incerteza em vez de apresentar o total como fato.",
    schema: competencyArgs,
    run: async (agent, input) => {
      const { year, month } = toCompetency(input.month);

      return getMonthSummary(agent.userId, year, month, agent.baseCurrency);
    },
    serialize: (result, agent) => dto.monthSummaryDto(result, agent.baseCurrency),
  });

  defineTool(server, "get_open_invoices", {
    title: "Faturas em aberto",
    description:
      "Quanto o usuário deve de cartão hoje, somando todas as faturas não pagas, " +
      "sem recorte por vencimento. Para 'quanto sai neste mês', use " +
      "get_balance_projection.",
    schema: noArgs,
    run: (agent) => getOpenInvoices(agent.userId, agent.baseCurrency),
    serialize: (result, agent) => dto.openInvoicesDto(result, agent.baseCurrency),
  });

  defineTool(server, "get_debts_by_category", {
    title: "Dívidas por motivo",
    description:
      "Dívidas em aberto agrupadas pela categoria de origem: não só " +
      "para quem se deve, mas com o quê aquele dinheiro foi gasto.",
    schema: noArgs,
    run: (agent) => getDebtsByCategory(agent.userId, agent.baseCurrency),
    serialize: (result, agent) => dto.debtsByCategoryDto(result, agent.baseCurrency),
  });

  defineTool(server, "get_balance_projection", {
    title: "Projeção de saldo",
    description:
      "Saldo projetado até o fim da competência: saldo atual mais pendências de " +
      "recorrentes menos faturas a vencer. `pending_count` conta as pendências " +
      "já materializadas — se parecer baixo, chame materialize_recurring, porque " +
      "nenhuma leitura materializa sozinha.",
    schema: competencyArgs,
    run: async (agent, input) => {
      const { year, month } = toCompetency(input.month);

      return getBalanceProjection(agent.userId, year, month, agent.baseCurrency);
    },
    serialize: (result, agent) => dto.balanceProjectionDto(result, agent.baseCurrency),
  });

  defineTool(server, "list_accounts", {
    title: "Contas e saldos",
    description:
      "Contas e carteiras com saldo na moeda nativa e convertido para a moeda base. " +
      `Uma conta sem cotação vem com \`balance_in_base_currency: null\` e fica fora do patrimônio. ${MONEY_WARNING}`,
    schema: noArgs,
    run: (agent) => getAccountBalances(agent.userId, agent.baseCurrency),
    serialize: (result, agent) => dto.accountsDto(result, agent.baseCurrency),
  });

  defineTool(server, "list_transactions", {
    title: "Lançamentos",
    description:
      "Lançamentos de conta bancária. Por mês (`month`) ou os mais recentes (`recent`). " +
      "Compra no cartão NÃO aparece aqui — ela vive na fatura (list_invoice_items). " +
      "`converted_amount` é o valor na moeda da conta e é o que moveu o saldo; " +
      "`amount` é a moeda em que o gasto aconteceu. " +
      "`status: PENDING` é projeção de recorrente e ainda não moveu saldo nenhum.",
    schema: listTransactionsArgs,
    run: async (agent, input) => {
      if (input.recent) {
        return listRecentTransactions(agent.userId, input.recent);
      }

      const { year, month } = toCompetency(input.month);

      return listMonthTransactions(agent.userId, year, month);
    },
    serialize: (result) => dto.transactionsDto(result),
  });

  defineTool(server, "list_credit_cards", {
    title: "Cartões de crédito",
    description:
      "Cartões com limite usado e disponível. `used_limit` é a soma das faturas não " +
      "pagas — a melhor aproximação sem integração bancária. `closing_day` importa: " +
      "compra depois dele cai na fatura do mês seguinte.",
    schema: noArgs,
    run: (agent) => listCreditCards(agent.userId),
    serialize: (result) => dto.creditCardsDto(result),
  });

  defineTool(server, "list_card_invoices", {
    title: "Faturas de um cartão",
    description:
      "Faturas de um cartão, da mais recente para a mais antiga. `competency` é a " +
      "competência da fatura, que pode ser o mês seguinte ao da compra.",
    schema: cardIdArgs,
    run: (agent, input) => listCardInvoices(agent.userId, input.credit_card_id),
    serialize: (result) => dto.invoicesDto(result),
  });

  defineTool(server, "list_invoice_items", {
    title: "Lançamentos de uma fatura",
    description:
      "Compras de uma fatura, sem a transação de pagamento. Numa compra parcelada, " +
      "cada linha é uma parcela: `installment.purchase_total` é o valor cheio da " +
      "compra e `installment.anchor_id` é a 1ª parcela, que identifica a compra " +
      "inteira para edição.",
    schema: invoiceIdArgs,
    run: (agent, input) => listInvoiceItems(agent.userId, input.invoice_id),
    serialize: (result) => dto.invoiceItemsDto(result),
  });

  defineTool(server, "list_debts", {
    title: "Dívidas",
    description:
      "Empréstimos entre pessoas. `type: LENT` = o usuário emprestou (a receber); " +
      "`BORROWED` = pegou emprestado (a pagar). `remaining_amount` é o que falta.",
    schema: listDebtsArgs,
    run: (agent, input) => listDebts(agent.userId, { personId: input.person_id, type: input.type }),
    serialize: (result) => dto.debtsDto(result),
  });

  defineTool(server, "get_debt_detail", {
    title: "Dívida com histórico",
    description:
      "Uma dívida com todo o histórico de movimentações: a que originou " +
      "o empréstimo (`is_origin: true`) e cada amortização.",
    schema: debtIdArgs,
    run: (agent, input) => getDebtDetail(agent.userId, input.debt_id),
    serialize: (result) => dto.debtDetailDto(result),
  });

  defineTool(server, "get_people_overview", {
    title: "Posição por pessoa",
    description:
      "Quanto cada pessoa deve ao usuário e vice-versa, na moeda base. " +
      "`net` positivo = a pessoa deve ao usuário.",
    schema: noArgs,
    run: (agent) => getPeopleOverview(agent.userId, agent.baseCurrency),
    serialize: (result, agent) => dto.peopleOverviewDto(result, agent.baseCurrency),
  });

  defineTool(server, "list_recurring", {
    title: "Gastos recorrentes",
    description:
      "Gastos recorrentes cadastrados. `target` diz se o lançamento gerado debita " +
      "em conta ou entra no cartão (exatamente um dos dois). " +
      "`is_estimated: true` significa valor variável, a conferir no vencimento.",
    schema: noArgs,
    run: (agent) => listRecurringExpenses(agent.userId),
    serialize: (result) => dto.recurringDto(result),
  });

  defineTool(server, "list_pending_occurrences", {
    title: "Pendências a confirmar",
    description:
      "Ocorrências de recorrentes já materializadas e ainda não confirmadas, até o " +
      "fim da competência. Inclui as vencidas de meses anteriores de propósito. " +
      "Confirmar é `confirm_pending`; materializar novas é `materialize_recurring`.",
    schema: competencyArgs,
    run: async (agent, input) => {
      const { year, month } = toCompetency(input.month);

      return listPendingOccurrences(agent.userId, year, month);
    },
    serialize: (result) => dto.pendingOccurrencesDto(result),
  });

  defineTool(server, "list_categories", {
    title: "Categorias",
    description:
      "Categorias em árvore de dois níveis. Os ids daqui são o que `categoryId` " +
      "espera nas ferramentas de escrita. Traz `color` e `icon` porque " +
      "update_category substitui o estado inteiro: sem lê-los aqui, uma edição " +
      "os apagaria sem querer.",
    schema: noArgs,
    run: (agent) => listCategoryTree(agent.userId),
    serialize: (result) => dto.categoriesDto(result),
  });

  defineTool(server, "get_deletion_impact", {
    title: "Impacto de uma remoção",
    description:
      "Mede o que uma remoção em cascata levaria embora, SEM remover nada. " +
      "`destroys` desaparece junto, `detaches` sobrevive perdendo o vínculo, e " +
      "`blocked_by` preenchido diz que a remoção seria recusada e por quê. " +
      "As remoções em si exigem `destructive:write` e confirmação em duas fases; " +
      "esta leitura serve para relatar a consequência antes de pedi-las.",
    schema: deletionImpactArgs,
    run: (agent, input) => describeDeletionImpact(agent.userId, input.target, input.id),
    serialize: (result) => dto.deletionImpactDto(result),
  });
}
