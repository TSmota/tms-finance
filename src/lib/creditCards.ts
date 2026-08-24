import type { CreditCard, Currency } from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { money, toStorage } from "@/lib/money";
import { byName } from "@/lib/sorting";
import { assertValidCycle } from "@/lib/invoiceCycle";
import type { CreditCardInput } from "@/lib/validations";
import type { AccountOption } from "@/components/forms/options";

/**
 * Cartões de crédito.
 *
 * O cartão não tem saldo: acumula faturas. O "limite usado" é derivado das
 * faturas em aberto, nunca gravado.
 */

/** A conta de pagamento padrão, se informada, tem de ser do próprio usuário. */
async function assertPaymentAccountOwned(userId: string, accountId: string | null) {
  if (accountId === null) {
    return;
  }

  const count = await prisma.financialAccount.count({ where: { id: accountId, userId } });

  if (count === 0) {
    throw new NotFoundError("Conta de pagamento não encontrada");
  }
}

export async function createCreditCard(
  userId: string,
  input: CreditCardInput,
): Promise<CreditCard> {
  assertValidCycle(input);
  await assertPaymentAccountOwned(userId, input.defaultPaymentAccountId);

  return prisma.creditCard.create({
    data: {
      userId,
      name: input.name,
      institution: input.institution,
      closingDay: input.closingDay,
      dueDay: input.dueDay,
      currency: input.currency,
      creditLimit: input.creditLimit === null ? null : toStorage(input.creditLimit),
      defaultPaymentAccountId: input.defaultPaymentAccountId,
    },
  });
}

/**
 * Atualiza o cartão.
 *
 * A moeda é imutável: trocá-la reinterpretaria os valores de todas as faturas
 * já emitidas. Os dias de ciclo podem mudar, e as faturas já criadas mantêm as
 * datas com que foram emitidas.
 */
export async function updateCreditCard(
  userId: string,
  id: string,
  input: CreditCardInput,
): Promise<CreditCard> {
  assertValidCycle(input);

  const existing = await prisma.creditCard.findFirst({ where: { id, userId }, select: { id: true } });

  if (!existing) {
    throw new NotFoundError("Cartão não encontrado");
  }

  await assertPaymentAccountOwned(userId, input.defaultPaymentAccountId);

  return prisma.creditCard.update({
    where: { id },
    data: {
      name: input.name,
      institution: input.institution,
      closingDay: input.closingDay,
      dueDay: input.dueDay,
      creditLimit: input.creditLimit === null ? null : toStorage(input.creditLimit),
      defaultPaymentAccountId: input.defaultPaymentAccountId,
    },
  });
}

/**
 * Remove o cartão, com suas faturas e lançamentos em cascata.
 *
 * Recusa se houver fatura paga: apagar levaria embora o histórico de
 * pagamentos, e a transação de pagamento na conta bancária ficaria órfã.
 */
export async function deleteCreditCard(userId: string, id: string): Promise<void> {
  const card = await prisma.creditCard.findFirst({
    where: { id, userId },
    select: { _count: { select: { invoices: { where: { status: "PAID" } } } } },
  });

  if (!card) {
    throw new NotFoundError("Cartão não encontrado");
  }

  if (card._count.invoices > 0) {
    throw new InvalidOperationError(
      "Este cartão tem faturas pagas e não pode ser removido — o histórico de pagamentos seria perdido",
    );
  }

  await prisma.creditCard.deleteMany({ where: { id, userId } });
}

export interface CreditCardSummary {
  id: string;
  name: string;
  institution: string | null;
  currency: Currency;
  closingDay: number;
  dueDay: number;
  creditLimit: number | null;
  defaultPaymentAccountId: string | null;
  defaultPaymentAccountName: string | null;
  /** Soma das faturas ainda não pagas. */
  usedLimit: number;
  /** `null` quando o limite não foi informado. */
  availableLimit: number | null;
  openInvoiceCount: number;
}

/**
 * Cartões com limite usado e disponível.
 *
 * "Usado" é a soma das faturas não pagas: a melhor aproximação sem integração
 * bancária.
 */
export async function listCreditCards(userId: string): Promise<CreditCardSummary[]> {
  const cards = await prisma.creditCard.findMany({
    where: { userId },
    include: {
      defaultPaymentAccount: { select: { name: true } },
      invoices: {
        where: { status: { not: "PAID" } },
        select: { totalAmount: true },
      },
    },
  });

  return cards
    .map((card) => {
      const used = card.invoices.reduce(
        (total, invoice) => total.plus(invoice.totalAmount),
        money(0),
      );
      const limit = card.creditLimit === null ? null : money(card.creditLimit);

      return {
        id: card.id,
        name: card.name,
        institution: card.institution,
        currency: card.currency,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        creditLimit: limit?.toNumber() ?? null,
        defaultPaymentAccountId: card.defaultPaymentAccountId,
        defaultPaymentAccountName: card.defaultPaymentAccount?.name ?? null,
        usedLimit: used.toNumber(),
        availableLimit: limit === null ? null : limit.minus(used).toNumber(),
        openInvoiceCount: card.invoices.length,
      };
    })
    .sort(byName);
}

/** Cartões para popular `Select`s. */
export async function listCreditCardOptions(userId: string): Promise<AccountOption[]> {
  const cards = await prisma.creditCard.findMany({
    where: { userId },
    select: { id: true, name: true, currency: true },
  });

  return cards
    .sort(byName)
    .map((card) => ({ value: card.id, label: card.name, currency: card.currency }));
}

export async function requireCreditCard(userId: string, id: string): Promise<CreditCard> {
  const card = await prisma.creditCard.findFirst({ where: { id, userId } });

  if (!card) {
    throw new NotFoundError("Cartão não encontrado");
  }

  return card;
}
