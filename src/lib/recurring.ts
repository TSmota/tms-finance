import type { Currency, RecurringExpense, Transaction } from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError, PaidInvoiceError } from "@/lib/errors";
import { getExchangeRate, FX_RATE_SCALE, FxUnavailableError, type FxRate } from "@/lib/fxService";
import { convertMoney, toStorage } from "@/lib/money";
import { assertAccountOwned, assertCategoryOwned } from "@/lib/ownership";
import { requireCreditCard } from "@/lib/creditCards";
import { addMonths, lastDayOfMonth, parseCalendarDate, utcDate } from "@/lib/dates";
import {
  competenciesToMaterialize,
  materializationHorizon,
  occurrencesInMonth,
  type RecurrenceRule,
} from "@/lib/recurrence";
import { invoiceCompetencyFor } from "@/lib/invoiceCycle";
import { recalcInvoiceTotals, resolveInvoice } from "@/lib/invoices";
import { applyToBalance, balanceDelta, type Tx } from "@/lib/accountBalance";
import { byName } from "@/lib/sorting";
import type { ConfirmOccurrenceInput, RecurringExpenseInput } from "@/lib/validations";

/**
 * Gastos recorrentes.
 *
 * As ocorrências são materializadas por `materializeDue`, chamada pelo cron
 * diário e por toda escrita de recorrência. **Nunca** na renderização: é
 * escrita multi-passo, com lock de fatura, e um GET não é lugar para ela.
 *
 * O destino determina o status:
 *
 * - **Conta bancária** → transação `PENDING`. Não move `currentBalance`; entra
 *   na projeção e espera a confirmação, que é quando o usuário ajusta o valor
 *   real de uma conta variável.
 * - **Cartão** → lançamento na fatura do ciclo, `CONFIRMED`. Sem pendência: o
 *   ciclo de vida é o da fatura, e compra no cartão não mexe em saldo.
 *
 * `lastGeneratedAt` significa "tudo até esta data já foi gerado". Sem esse
 * marcador, apagar uma pendência indesejada seria inútil: o próximo
 * carregamento a recriaria.
 */

/**
 * Competências geradas de uma vez, no máximo.
 *
 * Impede que uma recorrência antiga nunca materializada gere centenas de
 * pendências no primeiro acesso. Descarta as mais antigas.
 */
export const MAX_MATERIALIZED_MONTHS = 24;

/**
 * Meses no futuro que a materialização aceita.
 *
 * O mês vem da query string: sem o limite, `?month=2999-01` geraria milhares de
 * linhas e o `lastGeneratedAt` resultante suprimiria toda geração futura
 * legítima.
 */
export const MAX_FUTURE_MONTHS = 12;

export interface Competency {
  year: number;
  /** 1-12. */
  month: number;
}

export interface MaterializationResult {
  /** Ocorrências efetivamente criadas. */
  created: number;
  /**
   * Descrições das recorrências que não puderam ser materializadas agora — sem
   * cotação de câmbio, ou com ocorrência caindo em fatura já paga. Não avançam
   * o marcador, então tentam de novo no próximo carregamento.
   */
  skipped: string[];
}

type RecurringWithTargets = RecurringExpense & {
  creditCard: { id: string; closingDay: number; dueDay: number; currency: Currency } | null;
  account: { id: string; currency: Currency } | null;
};

const materializeInclude = {
  creditCard: { select: { id: true, closingDay: true, dueDay: true, currency: true } },
  account: { select: { id: true, currency: true } },
} as const;

function ruleOf(recurring: RecurringExpense): RecurrenceRule {
  return {
    frequency: recurring.frequency,
    dueDay: recurring.dueDay,
    startDate: recurring.startDate,
    endDate: recurring.endDate,
    active: recurring.active,
  };
}

/** Último instante coberto por uma competência, para gravar em `lastGeneratedAt`. */
function endOfCompetency(competency: Competency): Date {
  return utcDate(
    competency.year,
    competency.month,
    lastDayOfMonth(competency.year, competency.month),
  );
}

/** Competência pedida, limitada ao horizonte futuro aceito. */
function clampTarget(target: Competency, now: Date): Competency {
  const limit = addMonths(now.getUTCFullYear(), now.getUTCMonth() + 1, MAX_FUTURE_MONTHS);
  const index = (competency: Competency) => competency.year * 12 + competency.month;

  return index(target) > index(limit) ? limit : target;
}

/**
 * Data usada para consultar a cotação.
 *
 * Ocorrência futura não tem cotação — o Frankfurter publica série histórica —,
 * então cai para a taxa mais recente. O valor é reconvertido na confirmação.
 */
function fxDateFor(occurrence: Date, now: Date): Date | undefined {
  return occurrence.getTime() > now.getTime() ? undefined : occurrence;
}

/**
 * Materializa o que já está devido para um usuário, até o horizonte que as
 * próprias recorrências pedem.
 *
 * É este o ponto de entrada de fora da renderização: o cron chama para todos os
 * usuários, e as escritas de recorrência chamam para o usuário que acabou de
 * mexer, para que a ocorrência apareça na mesma navegação.
 */
export async function materializeDue(
  userId: string,
  now: Date = new Date(),
): Promise<MaterializationResult> {
  const rules = await prisma.recurringExpense.findMany({
    where: { userId, active: true },
    select: { frequency: true, dueDay: true, startDate: true, endDate: true, active: true },
  });

  if (rules.length === 0) {
    return { created: 0, skipped: [] };
  }

  const horizon = materializationHorizon(
    rules,
    { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 },
    MAX_FUTURE_MONTHS,
  );

  return materializeRecurring(userId, horizon.year, horizon.month, now);
}

/**
 * Varredura de todos os usuários com recorrência ativa, para o cron.
 *
 * Um usuário por vez, e não `Promise.all`: o pool tem poucas conexões e a
 * rotina não tem pressa. Uma falha inesperada de um usuário não pode impedir os
 * outros de rodar.
 */
export async function materializeAllUsers(
  now: Date = new Date(),
): Promise<{ users: number; created: number; failed: number }> {
  const owners = await prisma.recurringExpense.findMany({
    where: { active: true },
    distinct: ["userId"],
    select: { userId: true },
  });

  let created = 0;
  let failed = 0;

  for (const { userId } of owners) {
    try {
      created += (await materializeDue(userId, now)).created;
    } catch (error) {
      failed += 1;
      console.error("Falha ao materializar recorrentes do usuário:", userId, error);
    }
  }

  return { users: owners.length, created, failed };
}

/**
 * Materializa as ocorrências de todas as recorrências ativas até a competência
 * pedida, inclusive.
 *
 * Idempotente por dois mecanismos: `lastGeneratedAt`, que evita reprocessar
 * competências, e o índice único `(recurring_expense_id, date)`, que descarta a
 * inserção duplicada de duas execuções simultâneas.
 *
 * Nunca lança por indisponibilidade de câmbio nem por fatura já paga: a
 * recorrência afetada volta em `skipped`, sem avançar o marcador, e é tentada
 * de novo na próxima rodada.
 */
export async function materializeRecurring(
  userId: string,
  year: number,
  month: number,
  now: Date = new Date(),
): Promise<MaterializationResult> {
  const target = clampTarget({ year, month }, now);

  const recurrings = (await prisma.recurringExpense.findMany({
    where: { userId, active: true },
    include: materializeInclude,
  })) as RecurringWithTargets[];

  const result: MaterializationResult = { created: 0, skipped: [] };

  for (const recurring of recurrings) {
    const window = competenciesToMaterialize({
      startDate: recurring.startDate,
      materializedThrough: recurring.lastGeneratedAt,
      target,
      maxMonths: MAX_MATERIALIZED_MONTHS,
    });

    if (window.length === 0) {
      continue;
    }

    const occurrences = window.flatMap((competency) =>
      occurrencesInMonth(ruleOf(recurring), competency.year, competency.month),
    );

    const through = endOfCompetency(window[window.length - 1]!);

    try {
      result.created += await materializeOne(recurring, occurrences, through, now);
    } catch (error) {
      // Câmbio fora do ar e fatura já paga são condições temporárias de uma
      // recorrência só: derrubar a rodada inteira por causa delas deixaria as
      // outras sem gerar. Não avança o marcador, para tentar de novo depois.
      result.skipped.push(recurring.description);

      if (!isFxFailure(error) && !(error instanceof PaidInvoiceError)) {
        throw error;
      }
    }
  }

  return result;
}

function isFxFailure(error: unknown): boolean {
  return error instanceof FxUnavailableError;
}

/**
 * Grava as ocorrências de uma recorrência e avança seu marcador.
 *
 * As conversões acontecem antes de abrir a transação: chamada de rede dentro de
 * `$transaction` segura locks esperando a API.
 */
async function materializeOne(
  recurring: RecurringWithTargets,
  occurrences: Date[],
  through: Date,
  now: Date,
): Promise<number> {
  const target = recurring.account ?? recurring.creditCard;

  if (!target) {
    // Defensivo: o CHECK do banco já garante que exatamente um destino esteja
    // preenchido. Sem isto, dado impossível viraria lançamento sem destino.
    throw new InvalidOperationError(
      `Recorrência "${recurring.description}" não tem conta nem cartão`,
    );
  }

  const priced = await Promise.all(
    occurrences.map(async (date) => {
      const rate = await getExchangeRate({
        from: recurring.currency,
        to: target.currency,
        date: fxDateFor(date, now),
      });

      return { date, rate };
    }),
  );

  return prisma.$transaction(async (tx) => {
    let created = 0;

    if (recurring.account) {
      created = await insertAccountOccurrences(tx, recurring, recurring.account.id, priced);
    } else {
      created = await insertCardOccurrences(tx, recurring, priced);
    }

    await tx.recurringExpense.update({
      where: { id: recurring.id },
      // Nunca recua: um acesso a mês passado não pode desfazer o avanço.
      data: {
        lastGeneratedAt:
          recurring.lastGeneratedAt && recurring.lastGeneratedAt > through
            ? recurring.lastGeneratedAt
            : through,
      },
    });

    return created;
  }, MATERIALIZE_TX_OPTIONS);
}

/**
 * Folga para a materialização.
 *
 * Mesmo motivo de `createCardPurchase`: uma recorrência de cartão resolve e
 * trava uma fatura por competência, e o default de 5s do Prisma estourava com
 * `P2028` deixando todas travadas até lá.
 */
const MATERIALIZE_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

interface PricedOccurrence {
  date: Date;
  rate: FxRate;
}

/** Pendências no fluxo de caixa, para débito em conta. */
async function insertAccountOccurrences(
  tx: Tx,
  recurring: RecurringExpense,
  accountId: string,
  priced: PricedOccurrence[],
): Promise<number> {
  if (priced.length === 0) {
    return 0;
  }

  const { count } = await tx.transaction.createMany({
    data: priced.map(({ date, rate }) => ({
      userId: recurring.userId,
      type: "EXPENSE" as const,
      status: "PENDING" as const,
      description: recurring.description,
      date,
      amount: toStorage(recurring.amount),
      currency: recurring.currency,
      exchangeRate: rate.toFixed(FX_RATE_SCALE),
      convertedAmount: toStorage(convertMoney(recurring.amount, rate)),
      accountId,
      categoryId: recurring.categoryId,
      recurringExpenseId: recurring.id,
    })),
    skipDuplicates: true,
  });

  return count;
}

/**
 * Lançamentos na fatura do ciclo, para cobrança no cartão.
 *
 * Faturas são resolvidas e recalculadas em ordem crescente de competência, a
 * mesma de `createCardPurchase`: travar sempre na mesma ordem evita deadlock.
 */
async function insertCardOccurrences(
  tx: Tx,
  recurring: RecurringWithTargets,
  priced: PricedOccurrence[],
): Promise<number> {
  const card = recurring.creditCard!;
  const touchedInvoices = new Set<string>();
  let created = 0;

  for (const { date, rate } of priced) {
    const invoice = await resolveInvoice(tx, {
      userId: recurring.userId,
      card,
      competency: invoiceCompetencyFor(card, date),
    });

    const { count } = await tx.transaction.createMany({
      data: [
        {
          userId: recurring.userId,
          type: "EXPENSE" as const,
          status: "CONFIRMED" as const,
          description: recurring.description,
          date,
          amount: toStorage(recurring.amount),
          currency: recurring.currency,
          exchangeRate: rate.toFixed(FX_RATE_SCALE),
          convertedAmount: toStorage(convertMoney(recurring.amount, rate)),
          creditCardId: card.id,
          invoiceId: invoice.id,
          categoryId: recurring.categoryId,
          recurringExpenseId: recurring.id,
        },
      ],
      skipDuplicates: true,
    });

    created += count;

    if (count > 0) {
      touchedInvoices.add(invoice.id);
    }
  }

  await recalcInvoiceTotals(tx, touchedInvoices);

  return created;
}

// ---------------------------------------------------------------
// Confirmação de pendência
// ---------------------------------------------------------------

/**
 * Confirma uma pendência, opcionalmente com o valor real.
 *
 * O caso da conta de luz: a recorrência projeta R$ 180 e, no vencimento, o
 * usuário confirma os R$ 203,47 que chegaram. O valor confirmado é o que move
 * o saldo.
 *
 * Não exige que a pendência tenha vindo de uma recorrência: qualquer transação
 * `PENDING` de conta pode ser confirmada por aqui.
 */
export async function confirmPendingTransaction(
  userId: string,
  transactionId: string,
  input: ConfirmOccurrenceInput,
): Promise<Transaction> {
  const existing = await prisma.transaction.findFirst({
    where: { id: transactionId, userId, accountId: { not: null } },
    include: { account: { select: { id: true, currency: true } } },
  });

  if (!existing || !existing.account) {
    throw new NotFoundError("Pendência não encontrada");
  }

  const account = existing.account;

  if (existing.status === "CONFIRMED") {
    throw new InvalidOperationError("Esta transação já está confirmada");
  }

  const date = parseCalendarDate(input.date);
  const rate = await getExchangeRate({
    from: existing.currency,
    to: account.currency,
    date,
    manualRate: input.manualFxRate,
  });
  const convertedAmount = convertMoney(input.amount, rate);

  return prisma.$transaction(async (tx) => {
    // Update condicional: a checagem de status acontece fora da transação,
    // então duas confirmações simultâneas passariam as duas por ela e aplicariam
    // o valor em dobro. Quem perde a corrida atualiza 0 linhas.
    const { count } = await tx.transaction.updateMany({
      where: { id: transactionId, status: "PENDING" },
      data: {
        status: "CONFIRMED",
        date,
        amount: toStorage(input.amount),
        exchangeRate: rate.toFixed(FX_RATE_SCALE),
        convertedAmount: toStorage(convertedAmount),
      },
    });

    if (count === 0) {
      throw new InvalidOperationError("Esta transação já está confirmada");
    }

    const confirmed = await tx.transaction.findUniqueOrThrow({
      where: { id: transactionId },
    });

    // Só aqui o dinheiro sai da conta: enquanto pendente, nada foi aplicado.
    await applyToBalance(
      tx,
      account.id,
      balanceDelta(confirmed.type, confirmed.convertedAmount),
    );

    return confirmed;
  });
}

// ---------------------------------------------------------------
// CRUD das definições
// ---------------------------------------------------------------

/** Valida a posse de categoria e do destino, e devolve o destino normalizado. */
async function resolveTargets(userId: string, input: RecurringExpenseInput) {
  if ((input.accountId === null) === (input.creditCardId === null)) {
    throw new InvalidOperationError(
      "Escolha exatamente um destino: conta bancária ou cartão de crédito",
    );
  }

  await assertCategoryOwned(userId, input.categoryId);
  await assertAccountOwned(userId, input.accountId);

  if (input.creditCardId) {
    await requireCreditCard(userId, input.creditCardId);
  }
}

function definitionData(input: RecurringExpenseInput) {
  const startDate = parseCalendarDate(input.startDate);
  const endDate = input.endDate ? parseCalendarDate(input.endDate) : null;

  if (endDate && endDate < startDate) {
    throw new InvalidOperationError("A data final não pode ser anterior à inicial");
  }

  return {
    description: input.description,
    amount: toStorage(input.amount),
    currency: input.currency,
    frequency: input.frequency,
    dueDay: input.dueDay,
    isEstimated: input.isEstimated,
    startDate,
    endDate,
    categoryId: input.categoryId,
    accountId: input.accountId,
    creditCardId: input.creditCardId,
  };
}

export async function createRecurringExpense(
  userId: string,
  input: RecurringExpenseInput,
): Promise<RecurringExpense> {
  await resolveTargets(userId, input);

  return prisma.recurringExpense.create({ data: { userId, ...definitionData(input) } });
}

/**
 * Atualiza a definição.
 *
 * As ocorrências já materializadas não são reescritas: elas registram o que foi
 * projetado ou cobrado naquele ciclo. A mudança vale para os ciclos seguintes.
 */
export async function updateRecurringExpense(
  userId: string,
  id: string,
  input: RecurringExpenseInput,
): Promise<RecurringExpense> {
  const existing = await prisma.recurringExpense.count({ where: { id, userId } });

  if (existing === 0) {
    throw new NotFoundError("Recorrência não encontrada");
  }

  await resolveTargets(userId, input);

  return prisma.recurringExpense.update({ where: { id }, data: definitionData(input) });
}

export async function setRecurringActive(
  userId: string,
  id: string,
  active: boolean,
): Promise<void> {
  const { count } = await prisma.recurringExpense.updateMany({
    where: { id, userId },
    data: { active },
  });

  if (count === 0) {
    throw new NotFoundError("Recorrência não encontrada");
  }
}

/**
 * Remove a definição e as ocorrências ainda não liquidadas.
 *
 * O que já foi pago é histórico e permanece, apenas sem vínculo
 * (`onDelete: SetNull`). Pendências e itens de fatura em aberto saem junto, ou
 * o usuário ficaria com projeções de uma recorrência apagada.
 */
export async function deleteRecurringExpense(userId: string, id: string): Promise<void> {
  const existing = await prisma.recurringExpense.findFirst({ where: { id, userId } });

  if (!existing) {
    throw new NotFoundError("Recorrência não encontrada");
  }

  await prisma.$transaction(async (tx) => {
    const unsettled = await tx.transaction.findMany({
      where: {
        recurringExpenseId: id,
        OR: [{ status: "PENDING" }, { invoice: { status: { not: "PAID" } } }],
      },
      select: { id: true, invoiceId: true },
    });

    await tx.transaction.deleteMany({ where: { id: { in: unsettled.map((row) => row.id) } } });

    await recalcInvoiceTotals(
      tx,
      unsettled.map((row) => row.invoiceId).filter((value): value is string => !!value),
    );

    await tx.recurringExpense.delete({ where: { id } });
  });
}

// ---------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------

export interface RecurringListItem {
  id: string;
  description: string;
  amount: number;
  currency: Currency;
  frequency: RecurringExpense["frequency"];
  dueDay: number;
  active: boolean;
  isEstimated: boolean;
  startDate: Date;
  endDate: Date | null;
  lastGeneratedAt: Date | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  /** Exatamente um dos dois é preenchido. */
  accountId: string | null;
  accountName: string | null;
  creditCardId: string | null;
  creditCardName: string | null;
}

export async function listRecurringExpenses(userId: string): Promise<RecurringListItem[]> {
  const recurrings = await prisma.recurringExpense.findMany({
    where: { userId },
    include: {
      category: { select: { name: true, color: true } },
      account: { select: { name: true } },
      creditCard: { select: { name: true } },
    },
  });

  return recurrings
    .map((recurring) => ({
      id: recurring.id,
      description: recurring.description,
      amount: recurring.amount.toNumber(),
      currency: recurring.currency,
      frequency: recurring.frequency,
      dueDay: recurring.dueDay,
      active: recurring.active,
      isEstimated: recurring.isEstimated,
      startDate: recurring.startDate,
      endDate: recurring.endDate,
      lastGeneratedAt: recurring.lastGeneratedAt,
      categoryId: recurring.categoryId,
      categoryName: recurring.category.name,
      categoryColor: recurring.category.color,
      accountId: recurring.accountId,
      accountName: recurring.account?.name ?? null,
      creditCardId: recurring.creditCardId,
      creditCardName: recurring.creditCard?.name ?? null,
    }))
    // Inativas no fim; o resto em ordem alfabética de descrição.
    .sort((a, b) => {
      if (a.active !== b.active) {
        return a.active ? -1 : 1;
      }

      return byName({ name: a.description }, { name: b.description });
    });
}

export interface PendingOccurrence {
  id: string;
  description: string;
  date: Date;
  amount: number;
  currency: Currency;
  convertedAmount: number;
  accountId: string;
  accountName: string;
  accountCurrency: Currency;
  categoryName: string | null;
  categoryColor: string | null;
  /** Verdadeiro quando o valor projetado é estimativa e deve ser conferido. */
  isEstimated: boolean;
}

/**
 * Pendências a confirmar até o fim da competência.
 *
 * Inclui as vencidas de meses anteriores: uma conta de julho que ninguém
 * confirmou tem de continuar aparecendo em agosto, ou some da projeção.
 */
export async function listPendingOccurrences(
  userId: string,
  year: number,
  month: number,
): Promise<PendingOccurrence[]> {
  const horizon = projectionHorizon(year, month);

  const pending = await prisma.transaction.findMany({
    where: { userId, status: "PENDING", accountId: { not: null }, date: { lt: horizon } },
    orderBy: [{ date: "asc" }, { description: "asc" }],
    include: {
      account: { select: { name: true, currency: true } },
      category: { select: { name: true, color: true } },
      recurringExpense: { select: { isEstimated: true } },
    },
  });

  return pending.map((transaction) => ({
    id: transaction.id,
    description: transaction.description,
    date: transaction.date,
    amount: transaction.amount.toNumber(),
    currency: transaction.currency,
    convertedAmount: transaction.convertedAmount.toNumber(),
    accountId: transaction.accountId!,
    accountName: transaction.account?.name ?? "—",
    accountCurrency: transaction.account?.currency ?? transaction.currency,
    categoryName: transaction.category?.name ?? null,
    categoryColor: transaction.category?.color ?? null,
    isEstimated: transaction.recurringExpense?.isEstimated ?? false,
  }));
}

/** Fim da janela de projeção: o primeiro instante depois da competência. */
export function projectionHorizon(year: number, month: number): Date {
  const next = addMonths(year, month, 1);

  return utcDate(next.year, next.month, 1);
}
