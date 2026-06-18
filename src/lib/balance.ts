import { getExchangeRate } from "@/lib/fxService";
import { prisma } from "@/lib/db";
import { formatCurrency, toNumber } from "@/lib/currency";

// Re-exported for backward compatibility; defined in the client-safe currency module.
export { formatCurrency, toNumber };

export interface AccountBalance {
  /** The unique identifier of the account. */
  id: string;
  /** The name of the account. */
  name: string;
  /** The type of the account. */
  type: string;
  /** The currency of the account. */
  currency: string;
  /** The current balance of the account. */
  balance: number;
  /** The current balance converted to the user's preferred currency, or the original balance if conversion failed. */
  convertedBalance: number;
  /** False when the FX rate to the preferred currency could not be resolved. */
  converted: boolean;
}

/**
 * Retrieves the account balances for a user, including the converted balances in the user's preferred currency.
 * 
 * @param userId The ID of the user whose account balances to retrieve.
 * @param preferredCurrency The user's preferred currency, used for FX conversion. Balances in other currencies will be converted to this currency when possible.
 * @returns An object containing the account balances, the total net worth, and a flag indicating whether the net worth is complete.
 */
export async function getAccountBalances(userId: string, preferredCurrency: string): Promise<{
  accounts: AccountBalance[];
  netWorth: number;
  netWorthComplete: boolean;
}> {
  const accounts = await prisma.financialAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  // Sum all transactions for the user in one query, grouped by account + type.
  const grouped = await prisma.transaction.groupBy({
    by: ["accountId", "type"],
    where: { userId },
    _sum: { amount: true },
  });

  const balanceByAccount = new Map<string, number>(
    accounts.map((account) => [account.id, toNumber(account.initialBalance)]),
  );

  for (const row of grouped) {
    const current = balanceByAccount.get(row.accountId) ?? 0;
    const sum = toNumber(row._sum.amount);

    balanceByAccount.set(
      row.accountId,
      current + (row.type === "INFLOW" ? sum : -sum),
    );
  }

  const foreignCurrencies = [
    ...new Set(
      accounts
        .map((account) => account.currency)
        .filter((currency) => currency !== preferredCurrency),
    ),
  ];
  const rateByCurrency = new Map<string, number>();

  await Promise.all(
    foreignCurrencies.map(async (currency) => {
      try {
        const rate = await getExchangeRate({ from: currency, to: preferredCurrency });

        rateByCurrency.set(currency, rate);
      } catch {
        // Ignore FX errors and leave the rate as undefined, which will be handled later.
      }
    }),
  );

  let netWorth = 0;
  let netWorthComplete = true;

  const results: AccountBalance[] = accounts.map((account) => {
    const balance = balanceByAccount.get(account.id) ?? 0;
    const isPreferred = account.currency === preferredCurrency;
    const fxRate = isPreferred ? 1 : rateByCurrency.get(account.currency);
    const converted = fxRate !== undefined;
    const convertedBalance = converted ? balance * fxRate : balance;

    if (converted) {
      netWorth += convertedBalance;
    } else {
      netWorthComplete = false;
    }

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance,
      convertedBalance,
      converted,
    };
  });

  return { accounts: results, netWorth, netWorthComplete };
}
