import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  cardPurchaseSchema,
  categorySchema,
  confirmOccurrenceSchema,
  debtSchema,
  debtSettlementSchema,
  invoicePaymentSchema,
  personSchema,
  recurringExpenseSchema,
  transactionSchema,
} from "@/lib/validations";
import * as transactions from "@/lib/transactions";
import * as cardPurchases from "@/lib/cardPurchases";
import * as invoicePayments from "@/lib/invoicePayments";
import * as debts from "@/lib/debts";
import * as recurring from "@/lib/recurring";
import * as categories from "@/lib/categories";
import * as people from "@/lib/people";
import { competencyArgs, idArg, toCompetency } from "@/mcp/args";
import { defineTool } from "@/mcp/define";

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

/** A hierarquia de 2 níveis é validada no serviço, não no schema. */
const HIERARCHY_NOTE =
  "A hierarquia tem exatamente dois níveis: `parentId` só aceita categoria " +
  "raiz, e uma categoria que já tem subcategorias não pode virar subcategoria.";

const idOnlyArgs = z.object({ id: idArg });
const invoiceIdArgs = z.object({ invoice_id: idArg });

const updateTransactionArgs = z.object({ id: idArg, data: transactionSchema });
const updateCardPurchaseArgs = z.object({ id: idArg, data: cardPurchaseSchema });
const payInvoiceArgs = z.object({ invoice_id: idArg, data: invoicePaymentSchema });
const updateDebtArgs = z.object({ id: idArg, data: debtSchema });
const settleDebtArgs = z.object({ debt_id: idArg, data: debtSettlementSchema });
const updateRecurringArgs = z.object({ id: idArg, data: recurringExpenseSchema });
const setActiveArgs = z.object({ id: idArg, active: z.boolean() });
const confirmPendingArgs = z.object({ id: idArg, data: confirmOccurrenceSchema });
const updateCategoryArgs = z.object({ id: idArg, data: categorySchema });
const updatePersonArgs = z.object({ id: idArg, data: personSchema });

export function registerWriteTools(server: McpServer): void {
  // -------------------------------------------------------------
  // Lançamentos de conta — transactions:write
  // -------------------------------------------------------------

  defineTool(server, "create_transaction", {
    title: "Criar lançamento",
    description:
      "Cria entrada ou saída numa conta bancária e atualiza o saldo, atomicamente. " +
      "Para compra no cartão use create_card_purchase — cartão não sai da conta. " +
      FX_NOTE,
    schema: transactionSchema,
    run: (agent, input) => transactions.createTransaction(agent.userId, input),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "transactions",
  });

  defineTool(server, "update_transaction", {
    title: "Editar lançamento",
    description:
      "Substitui os dados do lançamento e reajusta o saldo da conta. `data` é o " +
      `estado completo, não um patch. ${FX_NOTE}`,
    schema: updateTransactionArgs,
    run: (agent, input) => transactions.updateTransaction(agent.userId, input.id, input.data),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "transactions",
  });

  defineTool(server, "delete_transaction", {
    title: "Apagar lançamento",
    description:
      "Apaga um lançamento de conta e reverte o saldo. Reversível recriando o " +
      "lançamento — os dados apagados são de uma linha só.",
    schema: idOnlyArgs,
    run: (agent, input) => transactions.deleteTransaction(agent.userId, input.id),
    serialize: () => ({ deleted: true }),
    affected: () => [],
    revalidates: "transactions",
  });

  // -------------------------------------------------------------
  // Compras no cartão — cards:write
  // -------------------------------------------------------------

  defineTool(server, "create_card_purchase", {
    title: "Lançar compra no cartão",
    description:
      "Lança compra no cartão, dividindo em parcelas quando `installments > 1`. " +
      "A compra NÃO sai da conta: ela entra na fatura, e é o pagamento " +
      "da fatura que move o saldo. Compra depois do `closing_day` cai na fatura do " +
      "mês seguinte. O resto dos centavos vai na 1ª parcela. " +
      FX_NOTE,
    schema: cardPurchaseSchema,
    run: (agent, input) => cardPurchases.createCardPurchase(agent.userId, input),
    serialize: (rows) => ({ installment_ids: rows.map((row) => row.id) }),
    affected: (rows) => rows.map((row) => row.id),
    revalidates: "cardPurchases",
  });

  defineTool(server, "update_card_purchase", {
    title: "Editar compra no cartão",
    description:
      "Substitui a compra inteira, recriando as parcelas. `id` pode ser qualquer " +
      "parcela do grupo — o serviço resolve a compra toda a partir dela. " +
      FX_NOTE,
    schema: updateCardPurchaseArgs,
    run: (agent, input) => cardPurchases.updateCardPurchase(agent.userId, input.id, input.data),
    serialize: (rows) => ({ installment_ids: rows.map((row) => row.id) }),
    affected: (rows) => rows.map((row) => row.id),
    revalidates: "cardPurchases",
  });

  defineTool(server, "delete_card_purchase", {
    title: "Apagar compra no cartão",
    description:
      "Apaga a compra e todas as suas parcelas, e recalcula os totais das faturas " +
      "afetadas. `id` pode ser qualquer parcela do grupo.",
    schema: idOnlyArgs,
    run: (agent, input) => cardPurchases.deleteCardPurchase(agent.userId, input.id),
    serialize: () => ({ deleted: true }),
    affected: () => [],
    revalidates: "cardPurchases",
  });

  // -------------------------------------------------------------
  // Pagamento de fatura — invoices:pay
  // -------------------------------------------------------------

  defineTool(server, "pay_invoice", {
    title: "Pagar fatura",
    description:
      "Paga a fatura debitando a conta informada. Cria o lançamento de pagamento, " +
      "marca a fatura como paga e move o saldo, atomicamente. O lançamento de " +
      `pagamento não tem categoria — ele só transfere o que já foi contado. ${FX_NOTE}`,
    schema: payInvoiceArgs,
    run: (agent, input) => invoicePayments.payInvoice(agent.userId, input.invoice_id, input.data),
    serialize: (row) => ({ payment_transaction_id: row.id }),
    affected: (row) => [row.id],
    revalidates: "invoices",
  });

  defineTool(server, "undo_invoice_payment", {
    title: "Desfazer pagamento de fatura",
    description:
      "Reverte o pagamento: apaga o lançamento, devolve o saldo à conta e volta a " +
      "fatura para fechada. É a operação inversa exata de pay_invoice.",
    schema: invoiceIdArgs,
    run: (agent, input) => invoicePayments.undoInvoicePayment(agent.userId, input.invoice_id),
    serialize: () => ({ undone: true }),
    affected: () => [],
    revalidates: "invoices",
  });

  // -------------------------------------------------------------
  // Dívidas — debts:write
  // -------------------------------------------------------------

  defineTool(server, "create_debt", {
    title: "Registrar empréstimo",
    description:
      "Registra um empréstimo entre pessoas e lança a movimentação de origem na " +
      "conta. `type: LENT` = o usuário emprestou (sai da conta); `BORROWED` = " +
      `pegou emprestado (entra). \`categoryId\` é obrigatória. ${FX_NOTE}`,
    schema: debtSchema,
    run: (agent, input) => debts.createDebt(agent.userId, input),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "debts",
  });

  defineTool(server, "update_debt", {
    title: "Editar empréstimo",
    description:
      "Substitui os dados da dívida e reajusta a movimentação de origem e os saldos. " +
      "Não pode reduzir o valor original abaixo do que já foi amortizado.",
    schema: updateDebtArgs,
    run: (agent, input) => debts.updateDebt(agent.userId, input.id, input.data),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "debts",
  });

  defineTool(server, "settle_debt", {
    title: "Amortizar dívida",
    description:
      "Abate parcial ou total da dívida: cria a movimentação, atualiza o " +
      "saldo restante e o status da dívida, atomicamente. Não aceita valor acima do " +
      `restante. \`categoryId\` vazia herda a categoria de origem. ${FX_NOTE} ` +
      "São duas conversões distintas: `manualFxRate` leva o valor à moeda da conta e " +
      "`manualDebtFxRate` à moeda da dívida.",
    schema: settleDebtArgs,
    run: (agent, input) => debts.settleDebt(agent.userId, input.debt_id, input.data),
    serialize: (row) => ({ settlement_transaction_id: row.id }),
    affected: (row) => [row.id],
    revalidates: "debts",
  });

  defineTool(server, "delete_settlement", {
    title: "Apagar amortização",
    description:
      "Apaga uma amortização, devolvendo o valor ao saldo restante da dívida e " +
      "revertendo o saldo da conta. Não serve para a movimentação de origem — para " +
      "remover a dívida inteira use delete_debt.",
    schema: idOnlyArgs,
    run: (agent, input) => debts.deleteSettlement(agent.userId, input.id),
    serialize: () => ({ deleted: true }),
    affected: () => [],
    revalidates: "debts",
  });

  // -------------------------------------------------------------
  // Recorrentes — recurring:write
  // -------------------------------------------------------------

  defineTool(server, "create_recurring", {
    title: "Criar gasto recorrente",
    description:
      "Cadastra um gasto recorrente. Informe exatamente um destino: `accountId` " +
      "(debita em conta) ou `creditCardId` (entra no cartão). " +
      "`isEstimated: true` para valor variável, que a confirmação vai pedir para " +
      "conferir. Criar não gera lançamento: use materialize_recurring.",
    schema: recurringExpenseSchema,
    run: (agent, input) => recurring.createRecurringExpense(agent.userId, input),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "recurring",
  });

  defineTool(server, "update_recurring", {
    title: "Editar gasto recorrente",
    description:
      "Substitui a definição da recorrência. Vale para as ocorrências futuras; as " +
      "já materializadas não mudam retroativamente.",
    schema: updateRecurringArgs,
    run: (agent, input) => recurring.updateRecurringExpense(agent.userId, input.id, input.data),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "recurring",
  });

  defineTool(server, "delete_recurring", {
    title: "Apagar gasto recorrente",
    description:
      "Apaga a recorrência e as pendências ainda não confirmadas dela. Os " +
      "lançamentos já confirmados permanecem — eles são dinheiro que de fato saiu.",
    schema: idOnlyArgs,
    run: (agent, input) => recurring.deleteRecurringExpense(agent.userId, input.id),
    serialize: () => ({ deleted: true }),
    affected: () => [],
    revalidates: "recurring",
  });

  defineTool(server, "set_recurring_active", {
    title: "Ativar ou pausar recorrente",
    description:
      "Liga ou desliga a recorrência sem apagá-la. Pausada, ela para de gerar " +
      "ocorrências novas e mantém o histórico.",
    schema: setActiveArgs,
    run: async (agent, input) => {
      await recurring.setRecurringActive(agent.userId, input.id, input.active);

      return { id: input.id, active: input.active };
    },
    serialize: (result) => result,
    affected: (result) => [result.id],
    revalidates: "recurring",
  });

  defineTool(server, "confirm_pending", {
    title: "Confirmar pendência",
    description:
      "Confirma uma ocorrência pendente com o valor real do vencimento: " +
      "muda o status para CONFIRMED e move o saldo da conta. Use " +
      `list_pending_occurrences para achar os ids. ${FX_NOTE}`,
    schema: confirmPendingArgs,
    run: (agent, input) => recurring.confirmPendingTransaction(agent.userId, input.id, input.data),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "recurring",
  });

  defineTool(server, "materialize_recurring", {
    title: "Materializar recorrentes",
    description:
      "Gera as ocorrências pendentes das recorrentes ativas até a competência " +
      "informada. Idempotente: chamar duas vezes não duplica nada. " +
      "É a ÚNICA forma de materializar pela API — nenhuma ferramenta de leitura " +
      "faz isso, de propósito.",
    schema: competencyArgs,
    run: async (agent, input) => {
      const { year, month } = toCompetency(input.month);

      return recurring.materializeRecurring(agent.userId, year, month);
    },
    serialize: (result) => result,
    revalidates: "recurring",
  });

  // -------------------------------------------------------------
  // Cadastros de base — setup:write
  // -------------------------------------------------------------

  defineTool(server, "create_category", {
    title: "Criar categoria",
    description:
      "Cria categoria raiz ou subcategoria. " +
      HIERARCHY_NOTE +
      " `color` é hexadecimal de 6 dígitos com `#`; ausente deixa a categoria " +
      "sem cor. Os ids resultantes são o que `categoryId` espera nas demais " +
      "ferramentas de escrita.",
    schema: categorySchema,
    run: (agent, input) => categories.createCategory(agent.userId, input),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "categories",
  });

  defineTool(server, "update_category", {
    title: "Editar categoria",
    description:
      "Substitui os dados da categoria. `data` é o estado completo, não um " +
      "patch: leia list_categories antes e reenvie os campos que deve manter, " +
      "inclusive `color` e o `parentId` da categoria que a contém na árvore. " +
      "Omitir `parentId` promove a subcategoria a raiz; omitir `color` apaga a " +
      "cor. " +
      HIERARCHY_NOTE,
    schema: updateCategoryArgs,
    run: (agent, input) => categories.updateCategory(agent.userId, input.id, input.data),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "categories",
  });

  defineTool(server, "create_person", {
    title: "Criar pessoa",
    description:
      "Cria a pessoa de um empréstimo ou dívida. O id resultante é o que " +
      "`personId` espera em create_debt — sem ele não há como registrar dívida " +
      "de alguém ainda não cadastrado.",
    schema: personSchema,
    run: (agent, input) => people.createPerson(agent.userId, input),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "people",
  });

  defineTool(server, "update_person", {
    title: "Editar pessoa",
    description:
      "Substitui nome e observações da pessoa. `data` é o estado completo, não " +
      "um patch: omitir `notes` apaga as observações. As dívidas dela não são " +
      "tocadas.",
    schema: updatePersonArgs,
    run: (agent, input) => people.updatePerson(agent.userId, input.id, input.data),
    serialize: (row) => ({ id: row.id }),
    affected: (row) => [row.id],
    revalidates: "people",
  });
}
