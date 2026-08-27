import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { toCalendarDate, type CalendarDate } from "@/lib/dates";
import { accountDeletionBlocker } from "@/lib/accounts";
import { categoryDeletionBlocker } from "@/lib/categories";
import { creditCardDeletionBlocker } from "@/lib/creditCards";
import { personDeletionBlocker } from "@/lib/people";

/**
 * Mede, antes de apagar, o que uma remoção levaria embora.
 *
 * As contagens têm de bater exatamente com o que a remoção apaga depois: um
 * preview que subconta é pior que preview nenhum. `blockedBy` vem dos
 * `*DeletionBlocker` dos serviços, para não existir uma segunda cópia da regra.
 */

export const DELETION_TARGETS = ["account", "credit_card", "person", "category", "debt"] as const;

export type DeletionTarget = (typeof DELETION_TARGETS)[number];

export interface ImpactEntry {
  /** Chave estável — é por ela que o teste e o log se referem à linha. */
  key: string;
  /** pt-BR: este texto vai para o prompt de confirmação, lido por humano. */
  label: string;
  count: number;
  /** `destroy` = desaparece com a remoção. `detach` = sobrevive sem o vínculo. */
  effect: "destroy" | "detach";
}

export interface DeletionImpact {
  target: DeletionTarget;
  id: string;
  /** Nome do recurso, para a pergunta de confirmação ser específica. */
  label: string;
  entries: ImpactEntry[];
  /**
   * Preenchido quando a remoção **vai** ser recusada, com o motivo.
   *
   * Poupa a segunda chamada: o agente descobre que a operação é impossível sem
   * gastar uma rodada de confirmação.
   */
  blockedBy: string | null;
  /** Data do lançamento mais antigo alcançado, quando há algum. */
  oldestRecord: CalendarDate | null;
}

/** Só as linhas com contagem > 0: uma lista de zeros é ruído no prompt. */
function compact(entries: ImpactEntry[]): ImpactEntry[] {
  return entries.filter((entry) => entry.count > 0);
}

export async function describeDeletionImpact(
  userId: string,
  target: DeletionTarget,
  id: string,
): Promise<DeletionImpact> {
  switch (target) {
    case "account":
      return accountImpact(userId, id);
    case "credit_card":
      return creditCardImpact(userId, id);
    case "person":
      return personImpact(userId, id);
    case "category":
      return categoryImpact(userId, id);
    case "debt":
      return debtImpact(userId, id);
  }
}

/**
 * Conta bancária: o caso perigoso.
 *
 * Cascateiam os lançamentos e as recorrentes (`RecurringExpense.accountId`
 * também é Cascade). Sobrevivem perdendo o vínculo as faturas pagas por esta
 * conta e os cartões que a têm como origem padrão, os dois `SetNull`.
 */
async function accountImpact(userId: string, id: string): Promise<DeletionImpact> {
  const account = await prisma.financialAccount.findFirst({
    where: { id, userId },
    select: { name: true, currency: true },
  });

  if (!account) {
    throw new NotFoundError("Conta não encontrada");
  }

  const [transactions, recurring, invoicesPaid, defaultForCards, oldest, blockedBy] =
    await Promise.all([
      prisma.transaction.count({ where: { userId, accountId: id } }),
      prisma.recurringExpense.count({ where: { userId, accountId: id } }),
      prisma.invoice.count({ where: { userId, paymentAccountId: id } }),
      prisma.creditCard.count({ where: { userId, defaultPaymentAccountId: id } }),
      prisma.transaction.findFirst({
        where: { userId, accountId: id },
        orderBy: { date: "asc" },
        select: { date: true },
      }),
      accountDeletionBlocker(userId, id),
    ]);

  return {
    target: "account",
    id,
    label: account.name,
    entries: compact([
      {
        key: "transactions",
        label: "lançamentos apagados junto",
        count: transactions,
        effect: "destroy",
      },
      {
        key: "recurring_expenses",
        label: "gastos recorrentes apagados junto",
        count: recurring,
        effect: "destroy",
      },
      {
        key: "invoices_paid_here",
        label: "faturas que perdem o registro de qual conta as pagou",
        count: invoicesPaid,
        effect: "detach",
      },
      {
        key: "cards_defaulting_here",
        label: "cartões que perdem a conta de pagamento padrão",
        count: defaultForCards,
        effect: "detach",
      },
    ]),
    blockedBy,
    oldestRecord: oldest ? toCalendarDate(oldest.date) : null,
  };
}

/** Cartão: recusa com fatura paga, senão cascateia faturas, lançamentos e recorrentes. */
async function creditCardImpact(userId: string, id: string): Promise<DeletionImpact> {
  const card = await prisma.creditCard.findFirst({
    where: { id, userId },
    select: { name: true },
  });

  if (!card) {
    throw new NotFoundError("Cartão não encontrado");
  }

  const [invoices, transactions, recurring, oldest, blockedBy] = await Promise.all([
    prisma.invoice.count({ where: { userId, creditCardId: id } }),
    prisma.transaction.count({ where: { userId, creditCardId: id } }),
    prisma.recurringExpense.count({ where: { userId, creditCardId: id } }),
    prisma.transaction.findFirst({
      where: { userId, creditCardId: id },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    creditCardDeletionBlocker(userId, id),
  ]);

  return {
    target: "credit_card",
    id,
    label: card.name,
    entries: compact([
      { key: "invoices", label: "faturas apagadas junto", count: invoices, effect: "destroy" },
      {
        key: "transactions",
        label: "lançamentos apagados junto",
        count: transactions,
        effect: "destroy",
      },
      {
        key: "recurring_expenses",
        label: "gastos recorrentes apagados junto",
        count: recurring,
        effect: "destroy",
      },
    ]),
    blockedBy,
    oldestRecord: oldest ? toCalendarDate(oldest.date) : null,
  };
}

/**
 * Pessoa: recusa com posição em aberto; senão as dívidas quitadas somem.
 *
 * Os lançamentos vinculados **não** são apagados (`Transaction.debtId` é
 * `SetNull`): o dinheiro continua no fluxo de caixa, mas o agrupamento por
 * dívida se perde. É o que a linha `detach` informa.
 */
async function personImpact(userId: string, id: string): Promise<DeletionImpact> {
  const person = await prisma.person.findFirst({
    where: { id, userId },
    select: { name: true },
  });

  if (!person) {
    throw new NotFoundError("Pessoa não encontrada");
  }

  const [debts, orphanedTransactions, oldest, blockedBy] = await Promise.all([
    prisma.debt.count({ where: { userId, personId: id } }),
    prisma.transaction.count({ where: { userId, debt: { personId: id } } }),
    prisma.transaction.findFirst({
      where: { userId, debt: { personId: id } },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    personDeletionBlocker(userId, id),
  ]);

  return {
    target: "person",
    id,
    label: person.name,
    entries: compact([
      {
        key: "debts",
        label: "dívidas quitadas que desaparecem do histórico",
        count: debts,
        effect: "destroy",
      },
      {
        key: "transactions_orphaned",
        label: "lançamentos que continuam no fluxo de caixa, mas sem vínculo com a dívida",
        count: orphanedTransactions,
        effect: "detach",
      },
    ]),
    blockedBy,
    oldestRecord: oldest ? toCalendarDate(oldest.date) : null,
  };
}

/**
 * Categoria: cascateia subcategorias, e os lançamentos perdem a categoria.
 *
 * Bloqueia quando uma recorrente ou uma dívida aponta para ela: `categoryId` é
 * obrigatório nos dois models.
 */
async function categoryImpact(userId: string, id: string): Promise<DeletionImpact> {
  const category = await prisma.category.findFirst({
    where: { id, userId },
    select: { name: true },
  });

  if (!category) {
    throw new NotFoundError("Categoria não encontrada");
  }

  // A hierarquia é de dois níveis, então um nível de filhos basta.
  const subcategories = await prisma.category.findMany({
    where: { userId, parentId: id },
    select: { id: true },
  });

  const affectedIds = [id, ...subcategories.map((row) => row.id)];

  const [transactions, blockedBy] = await Promise.all([
    prisma.transaction.count({ where: { userId, categoryId: { in: affectedIds } } }),
    categoryDeletionBlocker(userId, id),
  ]);

  return {
    target: "category",
    id,
    label: category.name,
    entries: compact([
      {
        key: "subcategories",
        label: "subcategorias apagadas junto",
        count: subcategories.length,
        effect: "destroy",
      },
      {
        key: "transactions_uncategorized",
        label: 'lançamentos que passam a contar como "Sem categoria"',
        count: transactions,
        effect: "detach",
      },
    ]),
    blockedBy,
    oldestRecord: null,
  };
}

/**
 * Dívida: as movimentações saem junto e cada saldo de conta volta ao que era.
 *
 * `deleteDebt` reverte os saldos dentro de um `$transaction`, então o que se
 * perde é o histórico do empréstimo, não a integridade do caixa.
 */
async function debtImpact(userId: string, id: string): Promise<DeletionImpact> {
  const debt = await prisma.debt.findFirst({
    where: { id, userId },
    select: { description: true },
  });

  if (!debt) {
    throw new NotFoundError("Dívida não encontrada");
  }

  const movements = await prisma.transaction.findMany({
    where: { userId, debtId: id },
    select: { accountId: true, status: true, date: true },
    orderBy: { date: "asc" },
  });

  // Só lançamento confirmado em conta move saldo — mesmo critério que
  // `deleteDebt` usa ao reverter.
  const touchedAccounts = new Set(
    movements
      .filter((row) => row.accountId !== null && row.status === "CONFIRMED")
      .map((row) => row.accountId as string),
  );

  return {
    target: "debt",
    id,
    label: debt.description,
    entries: compact([
      {
        key: "movements",
        label: "movimentações apagadas junto (empréstimo e amortizações)",
        count: movements.length,
        effect: "destroy",
      },
      {
        key: "accounts_rebalanced",
        label: "contas que terão o saldo revertido",
        count: touchedAccounts.size,
        effect: "detach",
      },
    ]),
    blockedBy: null,
    oldestRecord: movements[0] ? toCalendarDate(movements[0].date) : null,
  };
}
