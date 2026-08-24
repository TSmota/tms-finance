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
    select: { id: true, _count: { select: { debts: { where: { status: { not: "PAID" } } } } } },
  });

  if (!person) {
    throw new NotFoundError("Pessoa não encontrada");
  }

  if (person._count.debts > 0) {
    throw new InvalidOperationError(
      "Esta pessoa tem dívidas em aberto. Quite ou remova as dívidas antes.",
    );
  }

  await prisma.person.delete({ where: { id } });
}

export interface PersonPosition {
  id: string;
  name: string;
  notes: string | null;
  /** A receber, na moeda base. */
  receivable: number;
  /** A pagar, na moeda base. */
  payable: number;
  /** `receivable − payable`: positivo = a pessoa deve ao usuário. */
  net: number;
  /** Dívidas ainda não quitadas. */
  openDebts: number;
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
  const [people, debts] = await Promise.all([
    prisma.person.findMany({ where: { userId } }),
    prisma.debt.findMany({
      where: { userId, status: { not: "PAID" } },
      select: { personId: true, type: true, remainingAmount: true, currency: true },
    }),
  ]);

  const { rates, complete } = await resolveRatesToBase(
    debts.map((debt) => debt.currency),
    baseCurrency,
  );

  interface Bucket {
    receivable: Money[];
    payable: Money[];
    openDebts: number;
    complete: boolean;
  }

  const buckets = new Map<string, Bucket>();
  const bucketFor = (personId: string): Bucket => {
    const existing = buckets.get(personId);

    if (existing) {
      return existing;
    }

    const created: Bucket = { receivable: [], payable: [], openDebts: 0, complete: true };
    buckets.set(personId, created);

    return created;
  };

  for (const debt of debts) {
    const bucket = bucketFor(debt.personId);
    const rate = rates.get(debt.currency);

    bucket.openDebts += 1;

    if (rate === undefined) {
      // Sem cotação: fica fora da posição, e a pessoa sai marcada como parcial.
      bucket.complete = false;
      continue;
    }

    const value = money(debt.remainingAmount).times(rate);

    if (debt.type === "LENT") {
      bucket.receivable.push(value);
    } else {
      bucket.payable.push(value);
    }
  }

  const positions = people
    .map((person) => {
      const bucket = buckets.get(person.id);
      const receivable = sumMoney(bucket?.receivable ?? []);
      const payable = sumMoney(bucket?.payable ?? []);

      return {
        id: person.id,
        name: person.name,
        notes: person.notes,
        receivable: receivable.toNumber(),
        payable: payable.toNumber(),
        net: receivable.minus(payable).toNumber(),
        openDebts: bucket?.openDebts ?? 0,
        complete: bucket?.complete ?? true,
      };
    })
    // Quem tem posição em aberto primeiro; depois em ordem alfabética.
    .sort((a, b) => {
      if ((a.openDebts > 0) !== (b.openDebts > 0)) {
        return a.openDebts > 0 ? -1 : 1;
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
