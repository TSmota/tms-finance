import type { AccountType, Currency, FinancialAccount } from "@prisma/client";

import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getExchangeRate, toStoredRate, type FxRate } from "@/lib/fxService";
import { money, toStorage } from "@/lib/money";
import { byName } from "@/lib/sorting";
import type { AccountInput } from "@/lib/validations";

/**
 * Contas bancárias e carteiras.
 *
 * O saldo não é somado a cada leitura: vem de `current_balance`, mantido por
 * `@/lib/accountBalance` em toda escrita de transação.
 */

export async function createAccount(
  userId: string,
  input: AccountInput,
): Promise<FinancialAccount> {
  const initialBalance = toStorage(input.initialBalance);

  return prisma.financialAccount.create({
    data: {
      userId,
      name: input.name,
      type: input.type,
      institution: input.institution,
      currency: input.currency,
      initialBalance,
      // Conta nova não tem lançamentos: o saldo atual é o inicial.
      currentBalance: initialBalance,
    },
  });
}

/**
 * Atualiza a conta. Mexer no saldo inicial desloca o saldo atual pela mesma
 * diferença, preservando o efeito dos lançamentos já registrados.
 *
 * A moeda é deliberadamente imutável: trocá-la reinterpretaria todo o histórico
 * de `convertedAmount` — R$ 100 viraria US$ 100 sem nenhuma conversão.
 */
export async function updateAccount(
  userId: string,
  id: string,
  input: AccountInput,
): Promise<FinancialAccount> {
  const existing = await prisma.financialAccount.findFirst({
    where: { id, userId },
    select: { initialBalance: true },
  });

  if (!existing) {
    throw new NotFoundError("Conta não encontrada");
  }

  const nextInitial = money(input.initialBalance);
  const shift = nextInitial.minus(existing.initialBalance);

  return prisma.financialAccount.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      institution: input.institution,
      initialBalance: toStorage(nextInitial),
      currentBalance: shift.isZero() ? undefined : { increment: toStorage(shift) },
    },
  });
}

export async function deleteAccount(userId: string, id: string): Promise<void> {
  const { count } = await prisma.financialAccount.deleteMany({ where: { id, userId } });

  if (count === 0) {
    throw new NotFoundError("Conta não encontrada");
  }
}

/**
 * Contas do usuário, para popular `Select`s.
 *
 * A ordenação é feita na aplicação, não em `ORDER BY`: ver `@/lib/sorting`.
 */
export async function listAccounts(userId: string): Promise<FinancialAccount[]> {
  const accounts = await prisma.financialAccount.findMany({ where: { userId } });

  return accounts.sort(byName);
}

export interface AccountBalance {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: Currency;
  /** Saldo na moeda nativa da conta. */
  balance: number;
  /** Saldo convertido para a moeda base do usuário. */
  convertedBalance: number;
  /** Falso quando a taxa para a moeda base não pôde ser resolvida. */
  converted: boolean;
}

/**
 * Saldos das contas com conversão para a moeda base.
 *
 * Tolerante a falha de câmbio: conta sem cotação entra na lista com
 * `converted: false` e fica fora do patrimônio, que é sinalizado como
 * incompleto. Melhor um total parcial e honesto que um total errado.
 */
export async function getAccountBalances(
  userId: string,
  baseCurrency: Currency,
): Promise<{ accounts: AccountBalance[]; netWorth: number; netWorthComplete: boolean }> {
  const accounts = await prisma.financialAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  const foreignCurrencies = [
    ...new Set(
      accounts.map((account) => account.currency).filter((currency) => currency !== baseCurrency),
    ),
  ];

  /** Taxa neutra da moeda base — mesma precisão das demais, para não misturar tipos. */
  const ONE = toStoredRate(1);
  const rateByCurrency = new Map<Currency, FxRate>();

  await Promise.all(
    foreignCurrencies.map(async (currency) => {
      try {
        rateByCurrency.set(currency, await getExchangeRate({ from: currency, to: baseCurrency }));
      } catch {
        // Sem cotação: a conta entra na lista, mas fora do patrimônio.
      }
    }),
  );

  let netWorth = money(0);
  let netWorthComplete = true;

  const result = accounts.map((account) => {
    const balance = money(account.currentBalance);
    const rate =
      account.currency === baseCurrency ? ONE : rateByCurrency.get(account.currency);
    const converted = rate !== undefined;
    const convertedBalance = converted ? balance.times(rate) : balance;

    if (converted) {
      netWorth = netWorth.plus(convertedBalance);
    } else {
      netWorthComplete = false;
    }

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      institution: account.institution,
      currency: account.currency,
      balance: balance.toNumber(),
      convertedBalance: convertedBalance.toNumber(),
      converted,
    };
  });

  return { accounts: result, netWorth: netWorth.toNumber(), netWorthComplete };
}
