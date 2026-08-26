import type { Prisma, TransactionStatus, TransactionType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { money, sumMoney, toStorage, type Money, type MoneyInput } from "@/lib/money";

/**
 * Manutenção do saldo denormalizado `financial_accounts.current_balance`.
 *
 * O saldo é gravado, não calculado a cada leitura — então toda escrita de
 * transação precisa aplicar o delta **dentro do mesmo `$transaction`**, ou o
 * saldo dessincroniza.
 *
 * {@link recomputeBalance} é a rede de segurança: recalcula do zero a partir
 * dos lançamentos, e é o que os testes usam para provar que o denormalizado
 * está correto.
 */

/** Cliente Prisma dentro de um `$transaction`. */
export type Tx = Prisma.TransactionClient;

/**
 * Sinal que cada tipo aplica ao saldo da conta.
 *
 * `INVOICE_PAYMENT` é negativo: pagar a fatura é dinheiro saindo da conta
 * bancária.
 */
export function balanceSign(type: TransactionType): 1 | -1 {
  return type === "INCOME" ? 1 : -1;
}

/**
 * Delta que uma transação aplica ao saldo, já com sinal.
 *
 * Usa `convertedAmount` — o valor na moeda da conta —, nunca `amount`, que pode
 * estar em outra moeda.
 */
export function balanceDelta(type: TransactionType, convertedAmount: MoneyInput): Money {
  return money(convertedAmount).times(balanceSign(type));
}

/**
 * Verdadeiro quando a transação move o saldo de uma conta bancária.
 *
 * Compra no cartão não move porque tem `accountId` nulo; pendência projetada
 * não move porque está `PENDING`.
 */
export function affectsBalance(transaction: {
  accountId: string | null;
  status: "PENDING" | "CONFIRMED";
}): boolean {
  return transaction.accountId !== null && transaction.status === "CONFIRMED";
}

/**
 * Aplica um delta ao saldo da conta. **Só use dentro de `$transaction`.**
 *
 * Usa `increment` para que a soma aconteça no banco, num único UPDATE atômico —
 * ler-somar-escrever perderia atualizações concorrentes.
 */
export async function applyToBalance(
  tx: Tx,
  accountId: string,
  delta: MoneyInput,
): Promise<void> {
  const amount = money(delta);

  if (amount.isZero()) {
    return;
  }

  await tx.financialAccount.update({
    where: { id: accountId },
    data: { currentBalance: { increment: toStorage(amount) } },
  });
}

/** O que um estorno precisa saber sobre a transação que está desfazendo. */
export interface TransactionPreImage {
  accountId: string | null;
  status: TransactionStatus;
  type: TransactionType;
  amount: Prisma.Decimal;
  convertedAmount: Prisma.Decimal;
}

/**
 * Trava a linha da transação e devolve o retrato dela já sob o lock.
 *
 * O retrato lido **antes** de abrir a `$transaction` pode estar velho: uma
 * edição concorrente já teria trocado conta, tipo ou valor, e o estorno
 * devolveria o número errado à conta errada — dinheiro criado ou sumido. Com
 * `FOR UPDATE`, a segunda operação espera a primeira confirmar e, em READ
 * COMMITTED, relê o valor novo.
 *
 * Devolve `null` quando a linha não existe mais, para o chamador escolher a
 * mensagem: quem chega aqui já conferiu a posse, então "sumiu no meio" e "nunca
 * existiu" não são a mesma coisa para quem lê o erro.
 */
export async function lockTransaction(
  tx: Tx,
  id: string,
): Promise<TransactionPreImage | null> {
  const rows = await tx.$queryRaw<TransactionPreImage[]>`
    SELECT
      account_id AS "accountId",
      status,
      type,
      amount,
      converted_amount AS "convertedAmount"
    FROM finance.transactions
    WHERE id = ${id}::uuid
    FOR UPDATE
  `;

  return rows[0] ?? null;
}

/**
 * Recalcula o saldo a partir do saldo inicial e dos lançamentos confirmados.
 *
 * Não grava nada — devolve o valor esperado. Use {@link reconcileBalance} para
 * corrigir.
 */
export async function recomputeBalance(accountId: string): Promise<Money> {
  const account = await prisma.financialAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { initialBalance: true },
  });

  const grouped = await prisma.transaction.groupBy({
    by: ["type"],
    where: { accountId, status: "CONFIRMED" },
    _sum: { convertedAmount: true },
  });

  const movements = grouped.map((row) =>
    balanceDelta(row.type, row._sum.convertedAmount ?? 0),
  );

  return sumMoney([account.initialBalance, ...movements]);
}

/**
 * Corrige o saldo denormalizado a partir do recálculo, e informa se havia
 * divergência. Ponto de entrada para reconciliação manual.
 */
export async function reconcileBalance(
  accountId: string,
): Promise<{ stored: Money; expected: Money; drifted: boolean }> {
  const before = await prisma.financialAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { currentBalance: true },
  });

  const stored = money(before.currentBalance);
  const expected = await recomputeBalance(accountId);
  const drifted = !stored.equals(expected);

  if (drifted) {
    await prisma.financialAccount.update({
      where: { id: accountId },
      data: { currentBalance: toStorage(expected) },
    });
  }

  return { stored, expected, drifted };
}
