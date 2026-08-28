import type { AccountType, Currency } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * Fábricas para os testes de integração. Cada uma cria o mínimo válido e
 * aceita overrides, para que o teste declare só o que é relevante para ele.
 */

let sequence = 0;

/** Sufixo único por processo, para não colidir em campos @unique. */
function uid(): string {
  sequence += 1;

  return String(sequence);
}

export function makeUser(overrides: { email?: string; name?: string; baseCurrency?: Currency } = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user${uid()}@test.local`,
      name: overrides.name ?? "Usuário de Teste",
      baseCurrency: overrides.baseCurrency ?? "BRL",
    },
  });
}

export function makeAccount(
  userId: string,
  overrides: {
    name?: string;
    type?: AccountType;
    institution?: string;
    currency?: Currency;
    initialBalance?: string;
  } = {},
) {
  const initialBalance = overrides.initialBalance ?? "0.00";

  return prisma.financialAccount.create({
    data: {
      userId,
      name: overrides.name ?? `Conta ${uid()}`,
      type: overrides.type ?? "CHECKING",
      institution: overrides.institution,
      currency: overrides.currency ?? "BRL",
      initialBalance,
      // Conta nova: o saldo atual parte do saldo inicial.
      currentBalance: initialBalance,
    },
  });
}

export function makeCategory(
  userId: string,
  overrides: { name?: string; parentId?: string; color?: string } = {},
) {
  return prisma.category.create({
    data: {
      userId,
      name: overrides.name ?? `Categoria ${uid()}`,
      parentId: overrides.parentId,
      color: overrides.color,
    },
  });
}

export function makeCreditCard(
  userId: string,
  overrides: {
    name?: string;
    institution?: string;
    creditLimit?: string;
    defaultPaymentAccountId?: string;
    closingDay?: number;
    dueDay?: number;
    currency?: Currency;
  } = {},
) {
  return prisma.creditCard.create({
    data: {
      userId,
      name: overrides.name ?? `Cartão ${uid()}`,
      institution: overrides.institution,
      creditLimit: overrides.creditLimit,
      defaultPaymentAccountId: overrides.defaultPaymentAccountId,
      closingDay: overrides.closingDay ?? 20,
      dueDay: overrides.dueDay ?? 5,
      currency: overrides.currency ?? "BRL",
    },
  });
}

export function makePerson(userId: string, overrides: { name?: string; notes?: string } = {}) {
  return prisma.person.create({
    data: {
      userId,
      name: overrides.name ?? `Pessoa ${uid()}`,
      notes: overrides.notes,
    },
  });
}
