import type { Currency, Debt, Transaction, TransactionType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { getExchangeRate, FX_RATE_SCALE } from "@/lib/fxService";
import { convertMoney, money, toStorage, type Money } from "@/lib/money";
import { parseCalendarDate } from "@/lib/dates";
import { applyToBalance, balanceDelta, lockTransaction, type Tx } from "@/lib/accountBalance";
import { assertCategoryOwned, assertPersonOwned, requireAccount } from "@/lib/ownership";
import { deriveDebtStatus } from "@/lib/debtStatus";
import { assertOriginEditable, createOrigin, deleteOrigin, loadOrigin } from "@/lib/debtOrigin";
import { requireCreditCard } from "@/lib/creditCards";
import { recalcInvoiceTotals } from "@/lib/invoices";
import type { DebtTypeCode } from "@/lib/debtTypes";
import type { DebtInput, DebtSettlementInput } from "@/lib/validations";

/**
 * Folga para a origem parcelada. O default do Prisma é 5 s, e uma origem no teto
 * de `MAX_INSTALLMENTS` faz centenas de idas ao banco: estourar daria `P2028`
 * com todas as faturas travadas até lá.
 */
const INSTALLMENT_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

/**
 * Empréstimos e dívidas pessoais.
 *
 * Duas invariantes governam tudo aqui, e são a razão de cada `$transaction`:
 *
 * 1. `remainingAmount = originalAmount − Σ amortizações`, e `status` é derivado
 *    desses dois por {@link deriveDebtStatus} — nunca gravado à mão.
 * 2. Toda movimentação de dívida é também uma transação no fluxo de caixa:
 *    emprestar tira dinheiro da conta, receber de volta devolve.
 *
 * Nenhuma escrita toca só um dos lados.
 *
 * ### Sinais
 *
 * O tipo da dívida define o sinal das duas pontas, sempre opostos:
 *
 * | Dívida     | Origem            | Amortização        |
 * |------------|-------------------|--------------------|
 * | `LENT`     | `EXPENSE` (saiu)  | `INCOME` (voltou)  |
 * | `BORROWED` | `INCOME` (entrou) | `EXPENSE` (pagou)  |
 *
 * ### Moedas
 *
 * A dívida é denominada na própria moeda, fixada na criação. Amortização em
 * outra moeda é convertida duas vezes: para a moeda da dívida, que abate
 * `remainingAmount`, e para a da conta, que move o saldo. No caso comum as três
 * coincidem e nenhuma chamada de câmbio acontece.
 */

/** Sinal da transação que **origina** a dívida. */
export function originType(type: DebtTypeCode): TransactionType {
  return type === "LENT" ? "EXPENSE" : "INCOME";
}

/** Sinal da transação que **abate** a dívida — sempre o oposto da origem. */
export function settlementType(type: DebtTypeCode): TransactionType {
  return type === "LENT" ? "INCOME" : "EXPENSE";
}

/**
 * Grava `remainingAmount` e o `status` derivado dele, de uma vez.
 *
 * Único caminho de escrita desses dois campos, para que não exista lugar no
 * código onde um seja atualizado sem o outro.
 */
async function writeRemaining(
  tx: Tx,
  debt: { id: string; originalAmount: Money | string },
  remaining: Money,
): Promise<void> {
  await tx.debt.update({
    where: { id: debt.id },
    data: {
      remainingAmount: toStorage(remaining),
      status: deriveDebtStatus(debt.originalAmount, remaining),
    },
  });
}

/**
 * Registra a dívida e a movimentação que a originou.
 *
 * A transação de origem herda a categoria da dívida — o motivo do empréstimo —,
 * e é o que faz o valor aparecer no relatório por categoria.
 */
export async function createDebt(userId: string, input: DebtInput): Promise<Debt> {
  await assertPersonOwned(userId, input.personId);
  await assertCategoryOwned(userId, input.categoryId);

  // O destino define a moeda para a qual a taxa converte, e a posse é conferida
  // aqui, fora da transação.
  const card = input.creditCardId
    ? await requireCreditCard(userId, input.creditCardId)
    : null;
  const account = input.accountId ? await requireAccount(userId, input.accountId) : null;
  const targetCurrency = card?.currency ?? account?.currency;

  if (!targetCurrency) {
    throw new InvalidOperationError(
      "Escolha a origem: conta bancária ou cartão de crédito",
    );
  }

  const date = parseCalendarDate(input.date);

  const rate = await getExchangeRate({
    from: input.currency,
    to: targetCurrency,
    date,
    manualRate: input.manualFxRate,
  });

  return prisma.$transaction(
    async (tx) => {
      const debt = await tx.debt.create({
        data: {
          userId,
          personId: input.personId,
          categoryId: input.categoryId,
          type: input.type,
          status: "PENDING",
          description: input.description,
          originalAmount: toStorage(input.amount),
          // Nada foi abatido ainda: o restante nasce igual ao total.
          remainingAmount: toStorage(input.amount),
          currency: input.currency,
          dueDate: input.dueDate ? parseCalendarDate(input.dueDate) : null,
        },
      });

      await createOrigin(tx, {
        userId,
        debtId: debt.id,
        type: originType(input.type),
        input,
        date,
        rate,
        card,
      });

      return debt;
    },
    card ? INSTALLMENT_TX_OPTIONS : undefined,
  );
}

/**
 * Abate a dívida, parcial ou totalmente.
 *
 * Trava a linha antes de ler o restante: sem o lock, duas amortizações
 * simultâneas leem o mesmo saldo e a última gravação vence, deixando a dívida
 * devendo dinheiro já pago.
 */
export async function settleDebt(
  userId: string,
  debtId: string,
  input: DebtSettlementInput,
): Promise<Transaction> {
  const debt = await requireDebt(userId, debtId);

  await assertCategoryOwned(userId, input.categoryId);

  const account = await requireAccount(userId, input.accountId);
  const date = parseCalendarDate(input.date);

  const [accountRate, debtRate] = await Promise.all([
    getExchangeRate({
      from: input.currency,
      to: account.currency,
      date,
      manualRate: input.manualFxRate,
    }),
    // Taxa própria: reaproveitar `manualFxRate` debitaria a conta pela cotação
    // da dívida.
    getExchangeRate({
      from: input.currency,
      to: debt.currency,
      date,
      manualRate: input.manualDebtFxRate,
    }),
  ]);

  const towardsDebt = convertMoney(input.amount, debtRate);

  return prisma.$transaction(async (tx) => {
    const locked = await lockDebt(tx, debtId);
    const remaining = money(locked.remainingAmount);

    if (remaining.isZero()) {
      throw new InvalidOperationError("Esta dívida já está quitada");
    }

    if (towardsDebt.greaterThan(remaining)) {
      // Recusar em vez de limitar ao restante: aceitar silenciosamente um valor
      // maior gravaria no fluxo de caixa um dinheiro que não se moveu.
      throw new InvalidOperationError(
        `O valor abate mais do que o restante da dívida (${remaining.toFixed(2)} ${debt.currency})`,
      );
    }

    const settlement = await tx.transaction.create({
      data: {
        userId,
        type: settlementType(debt.type),
        status: "CONFIRMED",
        description: input.description ?? defaultSettlementDescription(debt),
        date,
        amount: toStorage(input.amount),
        currency: input.currency,
        exchangeRate: accountRate.toFixed(FX_RATE_SCALE),
        convertedAmount: toStorage(convertMoney(input.amount, accountRate)),
        accountId: account.id,
        // Herda a categoria de origem quando o usuário não escolhe outra.
        categoryId: input.categoryId ?? debt.categoryId,
        debtId,
      },
    });

    await applyToBalance(
      tx,
      account.id,
      balanceDelta(settlement.type, settlement.convertedAmount),
    );

    await writeRemaining(tx, locked, remaining.minus(towardsDebt));

    return settlement;
  });
}

/** Descrição padrão da amortização, quando o usuário não informa uma. */
function defaultSettlementDescription(debt: { type: DebtTypeCode; description: string }): string {
  const verb = debt.type === "LENT" ? "Recebimento" : "Pagamento";

  return `${verb} — ${debt.description}`;
}

/**
 * Remove uma amortização, devolvendo o valor ao restante da dívida.
 *
 * Sem ela, um recebimento lançado com valor errado só seria corrigível no banco.
 *
 * A movimentação de origem não sai por aqui — apagá-la deixaria a dívida sem o
 * lançamento que a criou. Para isso, {@link deleteDebt}.
 */
export async function deleteSettlement(userId: string, transactionId: string): Promise<void> {
  const settlement = await prisma.transaction.findFirst({
    where: { id: transactionId, userId, debtId: { not: null } },
    include: { debt: true },
  });

  if (!settlement || !settlement.debt) {
    throw new NotFoundError("Movimentação não encontrada");
  }

  const debt = settlement.debt;

  if (settlement.type === originType(debt.type)) {
    throw new InvalidOperationError(
      "Esta é a movimentação que originou a dívida. Remova a dívida inteira.",
    );
  }

  const rate = await getExchangeRate({
    from: settlement.currency,
    to: debt.currency,
    date: settlement.date,
  });

  await prisma.$transaction(async (tx) => {
    const locked = await lockDebt(tx, debt.id);
    // Mesma ordem de lock em todo o módulo: primeiro a dívida, depois a
    // movimentação. Inverter em um só lugar basta para dois estornos
    // simultâneos travarem em sentidos opostos.
    const previous = await lockTransaction(tx, transactionId);

    if (!previous) {
      throw new NotFoundError("Movimentação não encontrada");
    }

    // O valor volta a partir do que está gravado agora, não do que foi lido
    // antes do lock: a taxa depende da moeda e da data, que não mudaram, mas o
    // valor pode ter mudado entre as duas leituras.
    const towardsDebt = convertMoney(previous.amount, rate);

    await tx.transaction.delete({ where: { id: transactionId } });

    // Só reverte o que chegou a somar: uma amortização `PENDING` nunca tocou o
    // saldo, e estorná-la criaria dinheiro.
    if (previous.accountId && previous.status === "CONFIRMED") {
      await applyToBalance(
        tx,
        previous.accountId,
        balanceDelta(previous.type, previous.convertedAmount).negated(),
      );
    }

    const restored = money(locked.remainingAmount).plus(towardsDebt);
    // O CHECK do banco exige `remaining <= original`; limitar aqui evita que um
    // arredondamento de câmbio na volta derrube a operação.
    const capped = restored.greaterThan(locked.originalAmount)
      ? money(locked.originalAmount)
      : restored;

    await writeRemaining(tx, locked, capped);
  });
}

/**
 * Atualiza a dívida e a movimentação de origem, mantendo as duas coerentes.
 *
 * `type` e `currency` são imutáveis: trocar o tipo inverteria o sinal da origem
 * e de todas as amortizações já lançadas; trocar a moeda reinterpretaria
 * `originalAmount` e `remainingAmount` sem converter nada. Nos dois casos o
 * certo é remover e recriar.
 *
 * A origem é **apagada e recriada**, e não editada no lugar: o destino, a data e
 * o número de parcelas podem mudar, e cada uma dessas mudanças redistribui as
 * parcelas por outras faturas. É o mesmo caminho de `updateCardPurchase`, e é
 * o que faz uma única passagem cobrir conta→conta, conta→cartão, cartão→conta e
 * cartão→cartão.
 */
export async function updateDebt(userId: string, debtId: string, input: DebtInput): Promise<Debt> {
  const debt = await requireDebt(userId, debtId);

  if (input.type !== debt.type) {
    throw new InvalidOperationError(
      "O tipo da dívida não pode ser alterado. Remova e registre novamente.",
    );
  }

  if (input.currency !== debt.currency) {
    throw new InvalidOperationError(
      "A moeda da dívida não pode ser alterada. Remova e registre novamente.",
    );
  }

  await assertPersonOwned(userId, input.personId);
  await assertCategoryOwned(userId, input.categoryId);

  const origin = await loadOrigin(userId, debt);

  if (origin.transactions.length === 0) {
    throw new NotFoundError("Movimentação de origem não encontrada");
  }

  // Antes de abrir a transação, para dar mensagem em vez de erro de constraint.
  assertOriginEditable(origin, "editar");

  const card = input.creditCardId ? await requireCreditCard(userId, input.creditCardId) : null;
  const account = input.accountId ? await requireAccount(userId, input.accountId) : null;
  const targetCurrency = card?.currency ?? account?.currency;

  if (!targetCurrency) {
    throw new InvalidOperationError(
      "Escolha a origem: conta bancária ou cartão de crédito",
    );
  }

  const date = parseCalendarDate(input.date);

  const rate = await getExchangeRate({
    from: input.currency,
    to: targetCurrency,
    date,
    manualRate: input.manualFxRate,
  });

  return prisma.$transaction(
    async (tx) => {
      const locked = await lockDebt(tx, debtId);

      // O já abatido é o que o novo total precisa acomodar.
      const settled = money(locked.originalAmount).minus(locked.remainingAmount);
      const nextOriginal = money(input.amount);

      if (nextOriginal.lessThan(settled)) {
        throw new InvalidOperationError(
          `O novo valor é menor do que os ${settled.toFixed(2)} ${debt.currency} já abatidos`,
        );
      }

      // Mesma ordem do resto do módulo: dívida, depois movimentação.
      await deleteOrigin(tx, origin);

      await createOrigin(tx, {
        userId,
        debtId,
        type: originType(debt.type),
        input,
        date,
        rate,
        card,
        // Preserva a origem pendente: `update` nunca mexia no status, e recriar
        // sem carregá-lo deixaria uma origem projetada virar confirmada.
        status: card ? undefined : origin.transactions[0]?.status,
      });

      const remaining = nextOriginal.minus(settled);

      await tx.debt.update({
        where: { id: debtId },
        data: {
          personId: input.personId,
          categoryId: input.categoryId,
          description: input.description,
          originalAmount: toStorage(nextOriginal),
          remainingAmount: toStorage(remaining),
          status: deriveDebtStatus(nextOriginal, remaining),
          dueDate: input.dueDate ? parseCalendarDate(input.dueDate) : null,
        },
      });

      return tx.debt.findUniqueOrThrow({ where: { id: debtId } });
    },
    card || origin.target?.kind === "card" ? INSTALLMENT_TX_OPTIONS : undefined,
  );
}

/**
 * Remove a dívida com todas as suas movimentações, revertendo os saldos.
 *
 * As transações vinculadas têm `onDelete: SetNull`, então apagar só a dívida
 * deixaria os lançamentos sem vínculo — dinheiro movimentado sem explicação.
 *
 * Fatura paga é intocável: o dinheiro já saiu pelo total antigo, e apagar a
 * parcela deixaria `total_amount` menor que o valor pago com a fatura ainda
 * `PAID`.
 */
export async function deleteDebt(userId: string, debtId: string): Promise<void> {
  const debt = await requireDebt(userId, debtId);

  const origin = await loadOrigin(userId, debt);

  assertOriginEditable(origin, "remover");

  await prisma.$transaction(
    async (tx) => {
      const movements = await tx.transaction.findMany({
        where: { userId, debtId: debt.id },
        select: {
          id: true,
          type: true,
          convertedAmount: true,
          accountId: true,
          status: true,
          invoiceId: true,
        },
        // Ordem estável, para que contas tocadas por mais de uma movimentação
        // sejam atualizadas sempre na mesma sequência.
        orderBy: { id: "asc" },
      });

      await tx.transaction.deleteMany({
        where: { id: { in: movements.map((row) => row.id) } },
      });

      for (const movement of movements) {
        if (movement.accountId && movement.status === "CONFIRMED") {
          await applyToBalance(
            tx,
            movement.accountId,
            balanceDelta(movement.type, movement.convertedAmount).negated(),
          );
        }
      }

      await recalcInvoiceTotals(
        tx,
        movements
          .map((row) => row.invoiceId)
          .filter((id): id is string => id !== null),
      );

      await tx.debt.delete({ where: { id: debt.id } });
    },
    origin.target?.kind === "card" ? INSTALLMENT_TX_OPTIONS : undefined,
  );
}

/** Dívida do usuário, ou {@link NotFoundError}. */
export async function requireDebt(userId: string, debtId: string): Promise<Debt> {
  const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });

  if (!debt) {
    throw new NotFoundError("Dívida não encontrada");
  }

  return debt;
}

/**
 * Trava a linha da dívida e devolve os valores já sob o lock.
 *
 * `SELECT ... FOR UPDATE` cru porque o Prisma não expõe travamento de linha. Os
 * valores voltam como texto e passam por `money()`, nunca por `Number()`: a
 * coluna é `DECIMAL(12,2)`.
 */
async function lockDebt(
  tx: Tx,
  debtId: string,
): Promise<{ id: string; originalAmount: Money; remainingAmount: Money }> {
  const rows = await tx.$queryRaw<
    { id: string; original_amount: string; remaining_amount: string }[]
  >`SELECT id, original_amount::text, remaining_amount::text
      FROM finance.debts WHERE id = ${debtId}::uuid FOR UPDATE`;

  const row = rows[0];

  if (!row) {
    throw new NotFoundError("Dívida não encontrada");
  }

  return {
    id: row.id,
    originalAmount: money(row.original_amount),
    remainingAmount: money(row.remaining_amount),
  };
}

// ---------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------

export interface DebtListItem {
  id: string;
  type: DebtTypeCode;
  status: "PENDING" | "PARTIALLY_PAID" | "PAID";
  description: string;
  originalAmount: number;
  remainingAmount: number;
  /** Já abatido, em valor absoluto. */
  settledAmount: number;
  currency: Currency;
  dueDate: Date | null;
  personId: string;
  personName: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  /** Quantidade de amortizações lançadas. */
  settlementCount: number;
  /**
   * Conta e data da movimentação de origem.
   *
   * O formulário de edição precisa delas: sem isso, um "salvar" sem tocar
   * nesses campos moveria o lançamento de origem para outra conta e para a
   * data de criação do registro, corrompendo dois saldos.
   */
  originAccountId: string | null;
  originDate: Date | null;
  createdAt: Date;
}

const debtInclude = {
  person: { select: { name: true } },
  category: { select: { name: true, color: true } },
  _count: { select: { settlements: true } },
  settlements: {
    select: { type: true, accountId: true, date: true },
    orderBy: { createdAt: "asc" },
  },
} as const;

function toListItem(debt: Debt & {
  person: { name: string };
  category: { name: string; color: string | null };
  _count: { settlements: number };
  settlements: Array<{ type: TransactionType; accountId: string | null; date: Date }>;
}): DebtListItem {
  const original = money(debt.originalAmount);
  const remaining = money(debt.remainingAmount);
  // A primeira movimentação do sinal da origem é a que criou a dívida.
  const origin = debt.settlements.find((row) => row.type === originType(debt.type));

  return {
    id: debt.id,
    type: debt.type,
    status: debt.status,
    description: debt.description,
    originalAmount: original.toNumber(),
    remainingAmount: remaining.toNumber(),
    settledAmount: original.minus(remaining).toNumber(),
    currency: debt.currency,
    dueDate: debt.dueDate,
    personId: debt.personId,
    personName: debt.person.name,
    categoryId: debt.categoryId,
    categoryName: debt.category.name,
    categoryColor: debt.category.color,
    // Inclui a movimentação de origem, que também aponta para a dívida.
    settlementCount: Math.max(debt._count.settlements - 1, 0),
    originAccountId: origin?.accountId ?? null,
    originDate: origin?.date ?? null,
    createdAt: debt.createdAt,
  };
}

/** Dívidas do usuário: em aberto primeiro, quitadas no fim. */
export async function listDebts(
  userId: string,
  filters: { personId?: string; type?: DebtTypeCode } = {},
): Promise<DebtListItem[]> {
  const debts = await prisma.debt.findMany({
    where: { userId, personId: filters.personId, type: filters.type },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: debtInclude,
  });

  return debts.map(toListItem);
}

export interface DebtMovement {
  id: string;
  description: string;
  date: Date;
  /** Verdadeiro na movimentação que originou a dívida. */
  isOrigin: boolean;
  amount: number;
  currency: Currency;
  convertedAmount: number;
  accountId: string | null;
  accountName: string | null;
  accountCurrency: Currency | null;
  categoryName: string | null;
  categoryColor: string | null;
}

/** Dívida com todo o seu histórico de movimentações. */
export async function getDebtDetail(
  userId: string,
  debtId: string,
): Promise<{ debt: DebtListItem; movements: DebtMovement[] }> {
  const debt = await prisma.debt.findFirst({
    where: { id: debtId, userId },
    include: debtInclude,
  });

  if (!debt) {
    throw new NotFoundError("Dívida não encontrada");
  }

  const movements = await prisma.transaction.findMany({
    where: { userId, debtId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      account: { select: { name: true, currency: true } },
      category: { select: { name: true, color: true } },
    },
  });

  const origin = originType(debt.type);

  return {
    debt: toListItem(debt),
    movements: movements.map((movement, index) => ({
      id: movement.id,
      description: movement.description,
      date: movement.date,
      // A primeira movimentação do tipo da origem é a que criou a dívida.
      isOrigin:
        movement.type === origin &&
        movements.findIndex((candidate) => candidate.type === origin) === index,
      amount: movement.amount.toNumber(),
      currency: movement.currency,
      convertedAmount: movement.convertedAmount.toNumber(),
      accountId: movement.accountId,
      accountName: movement.account?.name ?? null,
      accountCurrency: movement.account?.currency ?? null,
      categoryName: movement.category?.name ?? null,
      categoryColor: movement.category?.color ?? null,
    })),
  };
}
