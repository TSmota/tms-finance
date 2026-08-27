import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import type { PasswordChangeInput } from "@/lib/validations";

/**
 * Troca a senha e invalida as sessões abertas.
 *
 * `passwordChangedAt` é a revogação: `auth.ts` compara essa marca com o
 * `authTime` do token, então todo cookie emitido antes daqui para de valer —
 * inclusive o de quem roubou a senha antiga.
 */
export async function changePassword(
  userId: string,
  input: PasswordChangeInput,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user) {
    throw new NotFoundError("Usuário não encontrado");
  }

  if (!user.passwordHash) {
    throw new InvalidOperationError(
      "Esta conta entra por provedor externo e não tem senha para trocar.",
    );
  }

  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw new InvalidOperationError("A senha atual está incorreta.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await bcrypt.hash(input.newPassword, 10),
      passwordChangedAt: new Date(),
    },
  });
}

/**
 * Cópia integral dos dados financeiros do usuário, para levar embora.
 *
 * Passa por `JSON.stringify` antes de voltar: o serializador de server action
 * recusa instância de classe, e as colunas `DECIMAL` chegam como
 * `Prisma.Decimal`. O `toJSON` do decimal.js já devolve o número como string,
 * que é o formato certo aqui — reconverter para `number` reintroduziria o
 * binário de ponto flutuante justamente no arquivo que a pessoa vai guardar.
 * Nada de credencial vai junto: nem o hash da senha, nem os tokens de agente.
 */
export async function exportUserData(userId: string): Promise<unknown> {
  const [
    user,
    accounts,
    categories,
    people,
    creditCards,
    invoices,
    debts,
    recurringExpenses,
    transactions,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, baseCurrency: true, createdAt: true },
    }),
    prisma.financialAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.category.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.person.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.creditCard.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.invoice.findMany({ where: { userId }, orderBy: [{ year: "asc" }, { month: "asc" }] }),
    prisma.debt.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.recurringExpense.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ where: { userId }, orderBy: { date: "asc" } }),
  ]);

  if (!user) {
    throw new NotFoundError("Usuário não encontrado");
  }

  return JSON.parse(
    JSON.stringify({
      exportedAt: new Date().toISOString(),
      user,
      accounts,
      categories,
      people,
      creditCards,
      invoices,
      debts,
      recurringExpenses,
      transactions,
    }),
  );
}
