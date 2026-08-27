import type { Currency } from "@prisma/client";

import { formatCurrency } from "@/lib/currency";
import { toCalendarDate, type CalendarDate } from "@/lib/dates";
import type { MonthSummary, OpenInvoices, DebtsByCategory, CategorySlice } from "@/lib/reports";
import type { AccountBalance } from "@/lib/accounts";
import type { TransactionListItem } from "@/lib/transactions";
import type { CreditCardSummary } from "@/lib/creditCards";
import type { InvoiceSummary, InvoiceItem } from "@/lib/invoices";
import type { DebtListItem, DebtMovement } from "@/lib/debts";
import type { PeopleOverview, PersonPosition } from "@/lib/people";
import type { RecurringListItem, PendingOccurrence } from "@/lib/recurring";
import type { BalanceProjection } from "@/lib/projection";
import type { CategoryNode } from "@/lib/categories";
import type { DeletionImpact } from "@/lib/deletionImpact";

/**
 * Projeções explícitas do domínio para o que o agente vê.
 *
 * **1. Nunca serializar objeto do Prisma cru.** Um `select` que ganha campo
 * novo vazaria sem ninguém notar. Cada campo é escrito à mão, então incluir
 * algo é uma decisão.
 *
 * **2. Dinheiro sai como string.** Um LLM *vai* somar o que receber, e
 * `0.1 + 0.2` continua dando `0.30000000000000004` na cabeça dele. Os serviços
 * já entregam `number`, então `toFixed(2)` é a maior precisão recuperável aqui —
 * e é exata para o alcance de `Decimal(12,2)`.
 *
 * **3. `complete: false` viaja junto.** Faltando cotação, o agente precisa ver
 * a marca para relatar a incerteza em vez de apresentar o número como fato.
 *
 * **4. Fluxo de caixa e gasto por categoria têm nomes diferentes.** O agente
 * escreve prosa sobre os números: chamar os dois de "despesa" produziria dois
 * valores distintos com o mesmo nome na mesma resposta.
 *
 * Cor de categoria é descartada nas projeções: o agente não renderiza. A
 * exceção é `categoriesDto`, onde a categoria é o recurso editável.
 */

/** Valor monetário como string de 2 casas. */
function amount(value: number): string {
  return value.toFixed(2);
}

/** Par valor+legível, para os totais que o agente provavelmente vai citar. */
function total(value: number, currency: Currency): { amount: string; formatted: string } {
  return { amount: amount(value), formatted: formatCurrency(value, currency) };
}

function day(value: Date): CalendarDate {
  return toCalendarDate(value);
}

function optionalDay(value: Date | null): CalendarDate | null {
  return value === null ? null : toCalendarDate(value);
}

function slices(values: CategorySlice[], currency: Currency) {
  return values.map((slice) => ({
    category: slice.name,
    ...total(slice.value, currency),
  }));
}

export function monthSummaryDto(summary: MonthSummary, currency: Currency) {
  return {
    currency,
    complete: summary.complete,
    /**
     * Fluxo de caixa: o que entrou e saiu das contas no mês, incluindo o
     * pagamento de fatura.
     */
    cash_flow: {
      income: total(summary.income, currency),
      cash_out: total(summary.expenses, currency),
      net: total(summary.net, currency),
      invoice_payments: total(summary.invoicePayments, currency),
    },
    /**
     * Onde o dinheiro foi gasto: despesa de conta mais compra no cartão pela
     * data da compra, excluindo pagamento de fatura. **Não** é o mesmo número
     * que `cash_flow.cash_out`.
     */
    spending: {
      total: total(summary.spendingTotal, currency),
      on_card: total(summary.cardSpending, currency),
      by_category: slices(summary.byCategory, currency),
    },
    /** A identidade entre as duas visões, explícita para o agente não deduzir errado. */
    relation: "cash_out = spending.total - spending.on_card + cash_flow.invoice_payments",
  };
}

export function openInvoicesDto(open: OpenInvoices, currency: Currency) {
  return {
    currency,
    complete: open.complete,
    outstanding: total(open.total, currency),
    invoice_count: open.count,
    next_due_date: optionalDay(open.nextDueDate),
  };
}

export function debtsByCategoryDto(debts: DebtsByCategory, currency: Currency) {
  return {
    currency,
    complete: debts.complete,
    receivable: { ...total(debts.receivableTotal, currency), by_category: slices(debts.receivable, currency) },
    payable: { ...total(debts.payableTotal, currency), by_category: slices(debts.payable, currency) },
  };
}

export function balanceProjectionDto(projection: BalanceProjection, currency: Currency) {
  return {
    currency,
    complete: projection.complete,
    current_balance: total(projection.currentBalance, currency),
    pending_income: total(projection.pendingIncome, currency),
    pending_expenses: total(projection.pendingExpenses, currency),
    unpaid_invoices: total(projection.unpaidInvoices, currency),
    projected_balance: total(projection.projectedBalance, currency),
    /**
     * Pendências que compõem a projeção. Materializar é escrita: use
     * `materialize_recurring` explicitamente, nenhuma leitura faz isso sozinha.
     */
    pending_count: projection.pendingCount,
    horizon: day(projection.horizon),
  };
}

export function accountsDto(
  result: { accounts: AccountBalance[]; netWorth: number; netWorthComplete: boolean },
  baseCurrency: Currency,
) {
  return {
    base_currency: baseCurrency,
    net_worth: { ...total(result.netWorth, baseCurrency), complete: result.netWorthComplete },
    accounts: result.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      institution: account.institution,
      currency: account.currency,
      balance: amount(account.balance),
      balance_in_base_currency: account.converted ? amount(account.convertedBalance) : null,
    })),
  };
}

export function transactionsDto(rows: TransactionListItem[]) {
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    type: row.type,
    /** `PENDING` = projeção de recorrente ainda não confirmada; não moveu saldo. */
    status: row.status,
    date: day(row.date),
    amount: amount(row.amount),
    currency: row.currency,
    /** Na moeda da conta — é este que moveu o saldo, nunca `amount`. */
    converted_amount: amount(row.convertedAmount),
    exchange_rate: row.exchangeRate.toFixed(4),
    account: row.accountId ? { id: row.accountId, name: row.accountName, currency: row.accountCurrency } : null,
    category: row.categoryId ? { id: row.categoryId, name: row.categoryName } : null,
    /** Valor é estimativa e deve ser conferido ao confirmar. */
    is_estimated: row.isEstimated,
    /** Preenchido = `delete_settlement` ou `undo_invoice_payment`, não esta linha. */
    managed_by: row.managedBy,
  }));
}

export function creditCardsDto(cards: CreditCardSummary[]) {
  return cards.map((card) => ({
    id: card.id,
    name: card.name,
    institution: card.institution,
    currency: card.currency,
    closing_day: card.closingDay,
    due_day: card.dueDay,
    credit_limit: card.creditLimit === null ? null : amount(card.creditLimit),
    /** Soma das faturas não pagas — a melhor aproximação sem integração bancária. */
    used_limit: amount(card.usedLimit),
    available_limit: card.availableLimit === null ? null : amount(card.availableLimit),
    open_invoice_count: card.openInvoiceCount,
    default_payment_account: card.defaultPaymentAccountId
      ? { id: card.defaultPaymentAccountId, name: card.defaultPaymentAccountName }
      : null,
  }));
}

export function invoicesDto(invoices: InvoiceSummary[]) {
  return invoices.map((invoice) => ({
    id: invoice.id,
    /** Competência da fatura: pode ser o mês seguinte ao da compra. */
    competency: `${invoice.year}-${String(invoice.month).padStart(2, "0")}`,
    status: invoice.status,
    closing_date: day(invoice.closingDate),
    due_date: day(invoice.dueDate),
    currency: invoice.currency,
    total: amount(invoice.total),
    item_count: invoice.itemCount,
    paid_at: optionalDay(invoice.paidAt),
  }));
}

export function invoiceItemsDto(items: InvoiceItem[]) {
  return items.map((item) => ({
    id: item.id,
    description: item.description,
    date: day(item.date),
    amount: amount(item.amount),
    currency: item.currency,
    converted_amount: amount(item.convertedAmount),
    exchange_rate: item.exchangeRate.toFixed(4),
    category: item.categoryId ? { id: item.categoryId, name: item.categoryName } : null,
    installment:
      item.installmentNumber === null
        ? null
        : {
            number: item.installmentNumber,
            of: item.totalInstallments,
            /** Total da compra inteira, somando as parcelas. */
            purchase_total: amount(item.groupTotal),
            /** 1ª parcela do grupo: é por ela que se edita a compra toda. */
            anchor_id: item.anchorId,
          },
    from_recurring: item.fromRecurring,
  }));
}

function debtDto(debt: DebtListItem) {
  return {
    id: debt.id,
    /** `LENT` = usuário emprestou (a receber). `BORROWED` = pegou emprestado. */
    type: debt.type,
    status: debt.status,
    description: debt.description,
    currency: debt.currency,
    original_amount: amount(debt.originalAmount),
    remaining_amount: amount(debt.remainingAmount),
    settled_amount: amount(debt.settledAmount),
    settlement_count: debt.settlementCount,
    due_date: optionalDay(debt.dueDate),
    person: { id: debt.personId, name: debt.personName },
    /** Motivo/origem, obrigatório. */
    category: { id: debt.categoryId, name: debt.categoryName },
    /**
     * Onde a movimentação de origem vive. Necessário para `update_debt`
     * preservar a origem: sem isso, todo salvar a moveria de lugar.
     */
    origin: debt.originTarget
      ? {
          kind: debt.originTarget.kind,
          id: debt.originTarget.id,
          installments: debt.originInstallments,
        }
      : null,
    /** Origem em fatura paga: `update_debt` e `delete_debt` vão recusar. */
    origin_locked: debt.originLocked,
  };
}

export function debtsDto(debts: DebtListItem[]) {
  return debts.map(debtDto);
}

export function debtDetailDto(result: { debt: DebtListItem; movements: DebtMovement[] }) {
  return {
    debt: debtDto(result.debt),
    movements: result.movements.map((movement) => ({
      id: movement.id,
      description: movement.description,
      date: day(movement.date),
      /** Verdadeiro na movimentação que originou a dívida. */
      is_origin: movement.isOrigin,
      amount: amount(movement.amount),
      currency: movement.currency,
      converted_amount: amount(movement.convertedAmount),
      account: movement.accountId
        ? { id: movement.accountId, name: movement.accountName, currency: movement.accountCurrency }
        : null,
      card: movement.creditCardId
        ? { id: movement.creditCardId, name: movement.cardName }
        : null,
      installment_number: movement.installmentNumber,
      total_installments: movement.totalInstallments,
    })),
  };
}

function personDto(person: PersonPosition, currency: Currency) {
  return {
    id: person.id,
    name: person.name,
    notes: person.notes,
    receivable: amount(person.receivable),
    payable: amount(person.payable),
    /** `receivable − payable`: positivo = a pessoa deve ao usuário. */
    net: amount(person.net),
    open_debts: person.openDebts,
    complete: person.complete,
    currency,
  };
}

export function peopleOverviewDto(overview: PeopleOverview, currency: Currency) {
  return {
    base_currency: currency,
    complete: overview.complete,
    total_receivable: total(overview.totalReceivable, currency),
    total_payable: total(overview.totalPayable, currency),
    total_net: total(overview.totalNet, currency),
    people: overview.people.map((person) => personDto(person, currency)),
  };
}

export function recurringDto(rows: RecurringListItem[]) {
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    amount: amount(row.amount),
    currency: row.currency,
    frequency: row.frequency,
    due_day: row.dueDay,
    active: row.active,
    /** Valor é estimativa: a confirmação deve pedir o valor real. */
    is_estimated: row.isEstimated,
    start_date: day(row.startDate),
    end_date: optionalDay(row.endDate),
    category: { id: row.categoryId, name: row.categoryName },
    /** Exatamente um dos dois é preenchido. */
    target: row.accountId
      ? { kind: "account" as const, id: row.accountId, name: row.accountName }
      : { kind: "credit_card" as const, id: row.creditCardId, name: row.creditCardName },
  }));
}

export function pendingOccurrencesDto(rows: PendingOccurrence[]) {
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    date: day(row.date),
    amount: amount(row.amount),
    currency: row.currency,
    converted_amount: amount(row.convertedAmount),
    account: { id: row.accountId, name: row.accountName, currency: row.accountCurrency },
    category: row.categoryName,
    is_estimated: row.isEstimated,
  }));
}

/**
 * Exceção à regra de descartar cor: aqui a categoria é o recurso, não enfeite de
 * projeção, e `update_category` substitui o estado inteiro.
 */
export function categoriesDto(nodes: CategoryNode[]) {
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    color: node.color,
    icon: node.icon,
    subcategories: node.subcategories.map((sub) => ({
      id: sub.id,
      name: sub.name,
      color: sub.color,
      icon: sub.icon,
    })),
  }));
}

/** O impacto medido, como o agente o vê quando a confirmação é pedida. */
export function deletionImpactDto(impact: DeletionImpact) {
  return {
    target: impact.target,
    id: impact.id,
    label: impact.label,
    /** Desaparece com a remoção. */
    destroys: impact.entries
      .filter((entry) => entry.effect === "destroy")
      .map((entry) => ({ what: entry.key, description: entry.label, count: entry.count })),
    /** Sobrevive, mas perde o vínculo. */
    detaches: impact.entries
      .filter((entry) => entry.effect === "detach")
      .map((entry) => ({ what: entry.key, description: entry.label, count: entry.count })),
    oldest_record: impact.oldestRecord,
    blocked_by: impact.blockedBy,
  };
}
