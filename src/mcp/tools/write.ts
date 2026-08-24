import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  cardPurchaseSchema,
  confirmOccurrenceSchema,
  debtSchema,
  debtSettlementSchema,
  invoicePaymentSchema,
  recurringExpenseSchema,
  transactionSchema,
} from "@/lib/validations";
import * as transactions from "@/lib/transactions";
import * as cardPurchases from "@/lib/cardPurchases";
import * as invoicePayments from "@/lib/invoicePayments";
import * as debts from "@/lib/debts";
import * as recurring from "@/lib/recurring";
import { competencyArgs, idArg, toCompetency } from "@/mcp/args";
import { REVALIDATE, runTool } from "@/mcp/guard";

/**
 * Ferramentas de escrita, cada uma sob o escopo do seu domínio.
 *
 * **Todos os schemas vêm de `@/lib/validations` sem alteração**, a mesma fonte
 * do formulário: o agente não consegue gravar nada que a UI recusaria. Um
 * schema próprio aqui seria uma segunda definição de "válido".
 *
 * Ferramentas de edição recebem `{ id, data }` em vez de espalhar os campos ao
 * lado do id: `recurringExpenseSchema` tem `.refine`, então não é um
 * `ZodObject` e não dá para estender — e a separação deixa explícito que `data`
 * é o estado completo do recurso, não um patch.
 */

/** Câmbio indisponível é resposta esperada, não falha: o guard devolve `retry`. */
const FX_NOTE =
  "Se a resposta vier com `code: \"fx_unavailable\"`, repita a chamada " +
  "acrescentando `manualFxRate` com a cotação.";

export function registerWriteTools(server: McpServer): void {
  // -------------------------------------------------------------
  // Lançamentos de conta — transactions:write
  // -------------------------------------------------------------

  server.registerTool(
    "create_transaction",
    {
      title: "Criar lançamento",
      description:
        "Cria entrada ou saída numa conta bancária e atualiza o saldo, atomicamente. " +
        "Para compra no cartão use create_card_purchase — cartão não sai da conta. " +
        FX_NOTE,
      inputSchema: transactionSchema,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "create_transaction",
        input: args,
        schema: transactionSchema,
        run: (agent, input) => transactions.createTransaction(agent.userId, input),
        serialize: (row) => ({ id: row.id }),
        affected: (row) => [row.id],
        revalidatePaths: REVALIDATE.transactions,
      }),
  );

  const updateTransactionArgs = z.object({ id: idArg, data: transactionSchema });

  server.registerTool(
    "update_transaction",
    {
      title: "Editar lançamento",
      description:
        "Substitui os dados do lançamento e reajusta o saldo da conta. `data` é o " +
        `estado completo, não um patch. ${FX_NOTE}`,
      inputSchema: updateTransactionArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "update_transaction",
        input: args,
        schema: updateTransactionArgs,
        run: (agent, input) =>
          transactions.updateTransaction(agent.userId, input.id, input.data),
        serialize: (row) => ({ id: row.id }),
        affected: (row) => [row.id],
        revalidatePaths: REVALIDATE.transactions,
      }),
  );

  const transactionIdArgs = z.object({ id: idArg });

  server.registerTool(
    "delete_transaction",
    {
      title: "Apagar lançamento",
      description:
        "Apaga um lançamento de conta e reverte o saldo. Reversível recriando o " +
        "lançamento — os dados apagados são de uma linha só.",
      inputSchema: transactionIdArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "delete_transaction",
        input: args,
        schema: transactionIdArgs,
        run: (agent, input) => transactions.deleteTransaction(agent.userId, input.id),
        serialize: () => ({ deleted: true }),
        affected: () => [],
        revalidatePaths: REVALIDATE.transactions,
      }),
  );

  // -------------------------------------------------------------
  // Compras no cartão — cards:write
  // -------------------------------------------------------------

  server.registerTool(
    "create_card_purchase",
    {
      title: "Lançar compra no cartão",
      description:
        "Lança compra no cartão, dividindo em parcelas quando `installments > 1`. " +
        "A compra NÃO sai da conta: ela entra na fatura, e é o pagamento " +
        "da fatura que move o saldo. Compra depois do `closing_day` cai na fatura do " +
        "mês seguinte. O resto dos centavos vai na 1ª parcela. " +
        FX_NOTE,
      inputSchema: cardPurchaseSchema,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "create_card_purchase",
        input: args,
        schema: cardPurchaseSchema,
        run: (agent, input) => cardPurchases.createCardPurchase(agent.userId, input),
        serialize: (rows) => ({ installment_ids: rows.map((row) => row.id) }),
        affected: (rows) => rows.map((row) => row.id),
        revalidatePaths: REVALIDATE.cards,
      }),
  );

  const updateCardPurchaseArgs = z.object({ id: idArg, data: cardPurchaseSchema });

  server.registerTool(
    "update_card_purchase",
    {
      title: "Editar compra no cartão",
      description:
        "Substitui a compra inteira, recriando as parcelas. `id` pode ser qualquer " +
        "parcela do grupo — o serviço resolve a compra toda a partir dela. " +
        FX_NOTE,
      inputSchema: updateCardPurchaseArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "update_card_purchase",
        input: args,
        schema: updateCardPurchaseArgs,
        run: (agent, input) =>
          cardPurchases.updateCardPurchase(agent.userId, input.id, input.data),
        serialize: (rows) => ({ installment_ids: rows.map((row) => row.id) }),
        affected: (rows) => rows.map((row) => row.id),
        revalidatePaths: REVALIDATE.cards,
      }),
  );

  server.registerTool(
    "delete_card_purchase",
    {
      title: "Apagar compra no cartão",
      description:
        "Apaga a compra e todas as suas parcelas, e recalcula os totais das faturas " +
        "afetadas. `id` pode ser qualquer parcela do grupo.",
      inputSchema: transactionIdArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "delete_card_purchase",
        input: args,
        schema: transactionIdArgs,
        run: (agent, input) => cardPurchases.deleteCardPurchase(agent.userId, input.id),
        serialize: () => ({ deleted: true }),
        affected: () => [],
        revalidatePaths: REVALIDATE.cards,
      }),
  );

  // -------------------------------------------------------------
  // Pagamento de fatura — invoices:pay
  // -------------------------------------------------------------

  const payInvoiceArgs = z.object({ invoice_id: idArg, data: invoicePaymentSchema });

  server.registerTool(
    "pay_invoice",
    {
      title: "Pagar fatura",
      description:
        "Paga a fatura debitando a conta informada. Cria o lançamento de pagamento, " +
        "marca a fatura como paga e move o saldo, atomicamente. O lançamento de " +
        `pagamento não tem categoria — ele só transfere o que já foi contado. ${FX_NOTE}`,
      inputSchema: payInvoiceArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "pay_invoice",
        input: args,
        schema: payInvoiceArgs,
        run: (agent, input) =>
          invoicePayments.payInvoice(agent.userId, input.invoice_id, input.data),
        serialize: (row) => ({ payment_transaction_id: row.id }),
        affected: (row) => [row.id],
        revalidatePaths: REVALIDATE.invoices,
      }),
  );

  const invoiceIdArgs = z.object({ invoice_id: idArg });

  server.registerTool(
    "undo_invoice_payment",
    {
      title: "Desfazer pagamento de fatura",
      description:
        "Reverte o pagamento: apaga o lançamento, devolve o saldo à conta e volta a " +
        "fatura para fechada. É a operação inversa exata de pay_invoice.",
      inputSchema: invoiceIdArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "undo_invoice_payment",
        input: args,
        schema: invoiceIdArgs,
        run: (agent, input) =>
          invoicePayments.undoInvoicePayment(agent.userId, input.invoice_id),
        serialize: () => ({ undone: true }),
        affected: () => [],
        revalidatePaths: REVALIDATE.invoices,
      }),
  );

  // -------------------------------------------------------------
  // Dívidas — debts:write
  // -------------------------------------------------------------

  server.registerTool(
    "create_debt",
    {
      title: "Registrar empréstimo",
      description:
        "Registra um empréstimo entre pessoas e lança a movimentação de origem na " +
        "conta. `type: LENT` = o usuário emprestou (sai da conta); `BORROWED` = " +
        `pegou emprestado (entra). \`categoryId\` é obrigatória. ${FX_NOTE}`,
      inputSchema: debtSchema,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "create_debt",
        input: args,
        schema: debtSchema,
        run: (agent, input) => debts.createDebt(agent.userId, input),
        serialize: (row) => ({ id: row.id }),
        affected: (row) => [row.id],
        revalidatePaths: REVALIDATE.debts,
      }),
  );

  const updateDebtArgs = z.object({ id: idArg, data: debtSchema });

  server.registerTool(
    "update_debt",
    {
      title: "Editar empréstimo",
      description:
        "Substitui os dados da dívida e reajusta a movimentação de origem e os saldos. " +
        "Não pode reduzir o valor original abaixo do que já foi amortizado.",
      inputSchema: updateDebtArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "update_debt",
        input: args,
        schema: updateDebtArgs,
        run: (agent, input) => debts.updateDebt(agent.userId, input.id, input.data),
        serialize: (row) => ({ id: row.id }),
        affected: (row) => [row.id],
        revalidatePaths: REVALIDATE.debts,
      }),
  );

  const settleDebtArgs = z.object({ debt_id: idArg, data: debtSettlementSchema });

  server.registerTool(
    "settle_debt",
    {
      title: "Amortizar dívida",
      description:
        "Abate parcial ou total da dívida: cria a movimentação, atualiza o " +
        "saldo restante e o status da dívida, atomicamente. Não aceita valor acima do " +
        `restante. \`categoryId\` vazia herda a categoria de origem. ${FX_NOTE}`,
      inputSchema: settleDebtArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "settle_debt",
        input: args,
        schema: settleDebtArgs,
        run: (agent, input) => debts.settleDebt(agent.userId, input.debt_id, input.data),
        serialize: (row) => ({ settlement_transaction_id: row.id }),
        affected: (row) => [row.id],
        revalidatePaths: REVALIDATE.debts,
      }),
  );

  server.registerTool(
    "delete_settlement",
    {
      title: "Apagar amortização",
      description:
        "Apaga uma amortização, devolvendo o valor ao saldo restante da dívida e " +
        "revertendo o saldo da conta. Não serve para a movimentação de origem — para " +
        "remover a dívida inteira use delete_debt.",
      inputSchema: transactionIdArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "delete_settlement",
        input: args,
        schema: transactionIdArgs,
        run: (agent, input) => debts.deleteSettlement(agent.userId, input.id),
        serialize: () => ({ deleted: true }),
        affected: () => [],
        revalidatePaths: REVALIDATE.debts,
      }),
  );

  // -------------------------------------------------------------
  // Recorrentes — recurring:write
  // -------------------------------------------------------------

  server.registerTool(
    "create_recurring",
    {
      title: "Criar gasto recorrente",
      description:
        "Cadastra um gasto recorrente. Informe exatamente um destino: `accountId` " +
        "(debita em conta) ou `creditCardId` (entra no cartão). " +
        "`isEstimated: true` para valor variável, que a confirmação vai pedir para " +
        "conferir. Criar não gera lançamento: use materialize_recurring.",
      inputSchema: recurringExpenseSchema,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "create_recurring",
        input: args,
        schema: recurringExpenseSchema,
        run: (agent, input) => recurring.createRecurringExpense(agent.userId, input),
        serialize: (row) => ({ id: row.id }),
        affected: (row) => [row.id],
        revalidatePaths: REVALIDATE.recurring,
      }),
  );

  const updateRecurringArgs = z.object({ id: idArg, data: recurringExpenseSchema });

  server.registerTool(
    "update_recurring",
    {
      title: "Editar gasto recorrente",
      description:
        "Substitui a definição da recorrência. Vale para as ocorrências futuras; as " +
        "já materializadas não mudam retroativamente.",
      inputSchema: updateRecurringArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "update_recurring",
        input: args,
        schema: updateRecurringArgs,
        run: (agent, input) =>
          recurring.updateRecurringExpense(agent.userId, input.id, input.data),
        serialize: (row) => ({ id: row.id }),
        affected: (row) => [row.id],
        revalidatePaths: REVALIDATE.recurring,
      }),
  );

  const recurringIdArgs = z.object({ id: idArg });

  server.registerTool(
    "delete_recurring",
    {
      title: "Apagar gasto recorrente",
      description:
        "Apaga a recorrência e as pendências ainda não confirmadas dela. Os " +
        "lançamentos já confirmados permanecem — eles são dinheiro que de fato saiu.",
      inputSchema: recurringIdArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "delete_recurring",
        input: args,
        schema: recurringIdArgs,
        run: (agent, input) => recurring.deleteRecurringExpense(agent.userId, input.id),
        serialize: () => ({ deleted: true }),
        affected: () => [],
        revalidatePaths: REVALIDATE.recurring,
      }),
  );

  const setActiveArgs = z.object({ id: idArg, active: z.boolean() });

  server.registerTool(
    "set_recurring_active",
    {
      title: "Ativar ou pausar recorrente",
      description:
        "Liga ou desliga a recorrência sem apagá-la. Pausada, ela para de gerar " +
        "ocorrências novas e mantém o histórico.",
      inputSchema: setActiveArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "set_recurring_active",
        input: args,
        schema: setActiveArgs,
        run: async (agent, input) => {
          await recurring.setRecurringActive(agent.userId, input.id, input.active);

          return { id: input.id, active: input.active };
        },
        serialize: (result) => result,
        affected: (result) => [result.id],
        revalidatePaths: REVALIDATE.recurring,
      }),
  );

  const confirmPendingArgs = z.object({ id: idArg, data: confirmOccurrenceSchema });

  server.registerTool(
    "confirm_pending",
    {
      title: "Confirmar pendência",
      description:
        "Confirma uma ocorrência pendente com o valor real do vencimento: " +
        "muda o status para CONFIRMED e move o saldo da conta. Use " +
        `list_pending_occurrences para achar os ids. ${FX_NOTE}`,
      inputSchema: confirmPendingArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "confirm_pending",
        input: args,
        schema: confirmPendingArgs,
        run: (agent, input) =>
          recurring.confirmPendingTransaction(agent.userId, input.id, input.data),
        serialize: (row) => ({ id: row.id }),
        affected: (row) => [row.id],
        revalidatePaths: REVALIDATE.recurring,
      }),
  );

  server.registerTool(
    "materialize_recurring",
    {
      title: "Materializar recorrentes",
      description:
        "Gera as ocorrências pendentes das recorrentes ativas até a competência " +
        "informada. Idempotente: chamar duas vezes não duplica nada. " +
        "É a ÚNICA forma de materializar pela API — nenhuma ferramenta de leitura " +
        "faz isso, de propósito.",
      inputSchema: competencyArgs,
    },
    async (args, ctx) =>
      runTool({
        ctx,
        tool: "materialize_recurring",
        input: args,
        schema: competencyArgs,
        run: async (agent, input) => {
          const { year, month } = toCompetency(input.month);

          return recurring.materializeRecurring(agent.userId, year, month);
        },
        serialize: (result) => result,
        revalidatePaths: REVALIDATE.recurring,
      }),
  );
}
