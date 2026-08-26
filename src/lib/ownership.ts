import type { Currency } from "@prisma/client";

import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

/**
 * Guardas de posse compartilhadas pelos serviços de domínio.
 *
 * Toda escrita que aceita um id vindo do cliente precisa provar que a linha é
 * do usuário antes de tocá-la. A checagem já esteve copiada em vários serviços,
 * e corrigir uma cópia deixava as outras erradas.
 *
 * Todas lançam {@link NotFoundError}, nunca um erro de autorização: "não
 * existe" e "é de outro usuário" devem ser indistinguíveis de fora, ou a
 * mensagem confirma a existência de um recurso alheio.
 *
 * As entidades com serviço próprio já expõem a sua guarda lá — `requireDebt`,
 * `requireInvoice`, `requireCreditCard` — e não são reexportadas aqui.
 */

/** Conta do usuário, ou {@link NotFoundError}. */
export async function requireAccount(
  userId: string,
  accountId: string,
): Promise<{ id: string; currency: Currency }> {
  const account = await prisma.financialAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true, currency: true },
  });

  if (!account) {
    throw new NotFoundError("Conta não encontrada");
  }

  return account;
}

/** Recusa conta de outro usuário. `null` é ausência legítima, não erro. */
export async function assertAccountOwned(
  userId: string,
  accountId: string | null,
): Promise<void> {
  if (accountId === null) {
    return;
  }

  const count = await prisma.financialAccount.count({ where: { id: accountId, userId } });

  if (count === 0) {
    throw new NotFoundError("Conta não encontrada");
  }
}

/** Recusa categoria de outro usuário. `null` é ausência legítima, não erro. */
export async function assertCategoryOwned(
  userId: string,
  categoryId: string | null,
): Promise<void> {
  if (categoryId === null) {
    return;
  }

  const count = await prisma.category.count({ where: { id: categoryId, userId } });

  if (count === 0) {
    throw new NotFoundError("Categoria não encontrada");
  }
}

/** Recusa pessoa de outro usuário. */
export async function assertPersonOwned(userId: string, personId: string): Promise<void> {
  const count = await prisma.person.count({ where: { id: personId, userId } });

  if (count === 0) {
    throw new NotFoundError("Pessoa não encontrada");
  }
}
