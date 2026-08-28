import { expect } from "vitest";

import { recomputeBalance } from "@/lib/accountBalance";
import { prisma } from "@/lib/db";

/**
 * Saldo da conta afirmado nas **duas pontas**.
 *
 * A regra está no ARCHITECTURE.md — seção Testes: o denormalizado
 * `currentBalance` tem de bater com a soma dos lançamentos. Ela vivia como
 * disciplina, e por isso era cumprida em 5 dos 20 arquivos: afirmar só o
 * denormalizado passa mesmo quando a escrita tocou um lado só, que é
 * exatamente a falha que a regra existe para pegar.
 *
 * A mensagem de cada `expect` diz qual das duas pontas divergiu — sem isso o
 * relatório de falha não distingue "valor errado" de "denormalizado furado".
 */
export async function expectBalance(accountId: string, expected: string): Promise<void> {
  const account = await prisma.financialAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { currentBalance: true },
  });

  expect(account.currentBalance.toFixed(2), "currentBalance (denormalizado)").toBe(expected);
  expect((await recomputeBalance(accountId)).toFixed(2), "soma dos lançamentos").toBe(expected);
}

/**
 * Só o lado denormalizado, para comparar dois momentos ("antes" e "depois")
 * quando o valor em si não interessa. Onde há valor esperado, use
 * `expectBalance`.
 */
export async function balanceOf(accountId: string): Promise<string> {
  const account = await prisma.financialAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { currentBalance: true },
  });

  return account.currentBalance.toFixed(2);
}
