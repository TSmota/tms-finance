import { listAccounts } from "@/lib/accounts";
import { listCategoryOptions } from "@/lib/categories";
import type { AccountOption, Option } from "@/components/forms/options";

/**
 * Opções de `Select` que quase toda página do dashboard precisa. Carregadas em
 * paralelo porque são consultas independentes.
 */
export async function loadFormOptions(
  userId: string,
): Promise<{ accounts: AccountOption[]; categories: Option[] }> {
  const [accounts, categories] = await Promise.all([
    listAccounts(userId),
    listCategoryOptions(userId),
  ]);

  return {
    accounts: accounts.map((account) => ({
      value: account.id,
      label: account.name,
      currency: account.currency,
    })),
    categories,
  };
}
