import type { Currency, Person } from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { money, sumMoney, type Money } from "@/lib/money";
import { resolveRatesToBase } from "@/lib/fxService";
import { byName } from "@/lib/sorting";
import type { PersonInput } from "@/lib/validations";

/**
 * Terceiros e a posição acumulada de cada um.
 *
 * A posição é sempre **derivada** das dívidas em aberto, nunca um campo: um
 * saldo denormalizado por pessoa seria mais uma coisa para dessincronizar, e
 * esta soma acontece uma vez por página.
 *
 * Como cada dívida tem sua moeda, a posição em moeda base exige converter
 * dívida por dívida. Faltando cotação, sai marcada como parcial.
 */

export async function listPeople(userId: string): Promise<Person[]> {
  const people = await prisma.person.findMany({
    where: { userId },
  });

  return people.sort(byName);
}

export async function createPerson(userId: string, input: PersonInput): Promise<Person> {
  return prisma.person.create({
    data: { userId, name: input.name, notes: input.notes },
  });
}

export async function updatePerson(
  userId: string,
  id: string,
  input: PersonInput,
): Promise<Person> {
  const { count } = await prisma.person.updateMany({
    where: { id, userId },
    data: { name: input.name, notes: input.notes },
  });

  if (count === 0) {
    throw new NotFoundError("Pessoa não encontrada");
  }

  return prisma.person.findUniqueOrThrow({ where: { id } });
}

/**
 * Remove a pessoa, desde que não haja posição em aberto.
 *
 * `Person → Debt` é `onDelete: Cascade`: apagar alguém que ainda deve dinheiro
 * faria a dívida desaparecer sem rastro. Com tudo quitado a remoção é
 * permitida, e o dinheiro movimentado continua no fluxo de caixa.
 */
export async function deletePerson(userId: string, id: string): Promise<void> {
  const person = await prisma.person.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!person) {
    throw new NotFoundError("Pessoa não encontrada");
  }

  const blocker = await personDeletionBlocker(userId, id);

  if (blocker) {
    throw new InvalidOperationError(blocker);
  }

  await prisma.person.delete({ where: { id } });
}

/** Motivo pelo qual a pessoa não pode ser removida, ou `null`. Ver `accountDeletionBlocker`. */
export async function personDeletionBlocker(
  userId: string,
  id: string,
): Promise<string | null> {
  const [openDebts, attributedTxs] = await Promise.all([
    prisma.debt.count({
      where: { userId, personId: id, status: { not: "PAID" } },
    }),
    prisma.transaction.count({
      where: { userId, personId: id, debtId: null },
    }),
  ]);

  if (openDebts > 0) {
    return `Esta pessoa tem ${openDebts} dívida(s) em aberto. Quite ou remova as dívidas antes.`;
  }

  if (attributedTxs > 0) {
    return `Esta pessoa tem ${attributedTxs} lançamento(s) atribuído(s). Remova ou reatribua os lançamentos antes.`;
  }

  return null;
}

export interface PersonPosition {
  id: string;
  name: string;
  notes: string | null;
  /** A receber, na moeda base (saldo em aberto). */
  receivable: number;
  /** A pagar, na moeda base (saldo em aberto). */
  payable: number;
  /** `receivable − payable`: positivo = a pessoa deve ao usuário. */
  net: number;
  /** Dívidas ainda não quitadas. */
  openDebts: number;
  /** Dívidas já quitadas. */
  paidDebts: number;
  /** Total de dívidas já registradas com a pessoa. */
  totalDebts: number;
  /** Moedas das dívidas desta pessoa. */
  currencies: Currency[];
  /** Total original contratado a receber (moeda base). */
  originalReceivable: number;
  /** Total já liquidado a receber (moeda base). */
  settledReceivable: number;
  /** Total original contratado a pagar (moeda base). */
  originalPayable: number;
  /** Total já liquidado a pagar (moeda base). */
  settledPayable: number;
  /** `false` quando alguma dívida não pôde ser convertida para a moeda base. */
  complete: boolean;
}

export interface PeopleOverview {
  people: PersonPosition[];
  /** Soma das posições de todas as pessoas, na moeda base. */
  totalReceivable: number;
  totalPayable: number;
  totalNet: number;
  complete: boolean;
}

export async function getPeopleOverview(
  userId: string,
  baseCurrency: Currency,
): Promise<PeopleOverview> {
  const [people, debts, attributedTxs] = await Promise.all([
    prisma.person.findMany({ where: { userId } }),
    prisma.debt.findMany({
      where: { userId },
      select: {
        personId: true,
        type: true,
        status: true,
        originalAmount: true,
        remainingAmount: true,
        currency: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        personId: { not: null },
        debtId: null,
        status: "CONFIRMED",
        OR: [
          { creditCardId: { not: null }, type: "EXPENSE" },
          { accountId: { not: null }, type: "INCOME" },
        ],
      },
      select: {
        personId: true,
        type: true,
        convertedAmount: true,
        creditCard: { select: { currency: true } },
        account: { select: { currency: true } },
      },
    }),
  ]);

  const currencies = [
    ...debts.map((debt) => debt.currency),
    ...attributedTxs.map((tx) => tx.creditCard?.currency ?? tx.account?.currency),
  ].filter((currency): currency is Currency => currency !== undefined && currency !== null);

  const { rates, complete } = await resolveRatesToBase(currencies, baseCurrency);

  interface Bucket {
    receivable: Money[];
    payable: Money[];
    originalReceivable: Money[];
    settledReceivable: Money[];
    originalPayable: Money[];
    settledPayable: Money[];
    openDebts: number;
    paidDebts: number;
    currencies: Set<Currency>;
    complete: boolean;
  }

  const buckets = new Map<string, Bucket>();
  const bucketFor = (personId: string): Bucket => {
    const existing = buckets.get(personId);

    if (existing) {
      return existing;
    }

    const created: Bucket = {
      receivable: [],
      payable: [],
      originalReceivable: [],
      settledReceivable: [],
      originalPayable: [],
      settledPayable: [],
      openDebts: 0,
      paidDebts: 0,
      currencies: new Set(),
      complete: true,
    };
    buckets.set(personId, created);

    return created;
  };

  for (const debt of debts) {
    const bucket = bucketFor(debt.personId);
    const rate = rates.get(debt.currency);

    bucket.currencies.add(debt.currency);

    if (debt.status === "PAID") {
      bucket.paidDebts += 1;
    } else {
      bucket.openDebts += 1;
    }

    if (rate === undefined) {
      // Sem cotação: fica fora da posição, e a pessoa sai marcada como parcial.
      bucket.complete = false;
      continue;
    }

    const remaining = money(debt.remainingAmount).times(rate);
    const original = money(debt.originalAmount).times(rate);
    const settled = original.minus(remaining);

    if (debt.type === "LENT") {
      bucket.originalReceivable.push(original);
      bucket.settledReceivable.push(settled);
      if (debt.status !== "PAID") {
        bucket.receivable.push(remaining);
      }
    } else {
      bucket.originalPayable.push(original);
      bucket.settledPayable.push(settled);
      if (debt.status !== "PAID") {
        bucket.payable.push(remaining);
      }
    }
  }

  for (const tx of attributedTxs) {
    if (!tx.personId) {
      continue;
    }

    const bucket = bucketFor(tx.personId);
    const currency = tx.creditCard?.currency ?? tx.account?.currency;

    if (currency) {
      bucket.currencies.add(currency);
    }

    const rate = currency ? rates.get(currency) : undefined;

    if (rate === undefined) {
      bucket.complete = false;
      continue;
    }

    const value = money(tx.convertedAmount).times(rate);

    if (tx.type === "EXPENSE") {
      bucket.receivable.push(value);
      bucket.originalReceivable.push(value);
    } else {
      // Reembolso/pagamento recebido em conta reduz o saldo a receber da pessoa.
      bucket.receivable.push(value.negated());
      bucket.settledReceivable.push(value);
    }
  }

  const positions = people
    .map((person) => {
      const bucket = buckets.get(person.id);
      const rawReceivable = sumMoney(bucket?.receivable ?? []);
      const rawPayable = sumMoney(bucket?.payable ?? []);
      // Se o reembolso excedeu os gastos atribuídos, o excedente vira saldo a pagar.
      const receivable = rawReceivable.isNegative() ? money(0) : rawReceivable;
      const payable = rawReceivable.isNegative()
        ? rawPayable.plus(rawReceivable.abs())
        : rawPayable;
      const originalReceivable = sumMoney(bucket?.originalReceivable ?? []);
      const settledReceivable = sumMoney(bucket?.settledReceivable ?? []);
      const originalPayable = sumMoney(bucket?.originalPayable ?? []);
      const settledPayable = sumMoney(bucket?.settledPayable ?? []);

      return {
        id: person.id,
        name: person.name,
        notes: person.notes,
        receivable: receivable.toNumber(),
        payable: payable.toNumber(),
        net: receivable.minus(payable).toNumber(),
        openDebts: bucket?.openDebts ?? 0,
        paidDebts: bucket?.paidDebts ?? 0,
        totalDebts: (bucket?.openDebts ?? 0) + (bucket?.paidDebts ?? 0),
        currencies: Array.from(bucket?.currencies ?? []),
        originalReceivable: originalReceivable.toNumber(),
        settledReceivable: settledReceivable.toNumber(),
        originalPayable: originalPayable.toNumber(),
        settledPayable: settledPayable.toNumber(),
        complete: bucket?.complete ?? true,
      };
    })
    // Quem tem posição em aberto primeiro; depois em ordem alfabética.
    .sort((a, b) => {
      const aActive = a.openDebts > 0 || a.receivable !== 0 || a.payable !== 0;
      const bActive = b.openDebts > 0 || b.receivable !== 0 || b.payable !== 0;

      if (aActive !== bActive) {
        return aActive ? -1 : 1;
      }

      return byName(a, b);
    });

  const totalReceivable = sumMoney(positions.map((position) => position.receivable));
  const totalPayable = sumMoney(positions.map((position) => position.payable));

  return {
    people: positions,
    totalReceivable: totalReceivable.toNumber(),
    totalPayable: totalPayable.toNumber(),
    totalNet: totalReceivable.minus(totalPayable).toNumber(),
    complete: complete && positions.every((position) => position.complete),
  };
}

/** Pessoas para popular `Select`s. */
export async function listPersonOptions(
  userId: string,
): Promise<Array<{ value: string; label: string }>> {
  const people = await prisma.person.findMany({
    where: { userId },
    select: { id: true, name: true },
  });

  return people
    .sort(byName)
    .map((person) => ({ value: person.id, label: person.name }));
}
