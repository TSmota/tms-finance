import { listAccounts } from "@/lib/accounts";
import { listCategoryOptions } from "@/lib/categories";
import { listPersonOptions } from "@/lib/people";
import type { AccountOption, Option } from "@/lib/options";

/**
 * Opções de `Select` que quase toda página do dashboard precisa. Carregadas em
 * paralelo porque são consultas independentes.
 */
export async function loadFormOptions(
  userId: string,
): Promise<{ accounts: AccountOption[]; categories: Option[]; people: Option[] }> {
  const [accounts, categories, people] = await Promise.all([
    listAccounts(userId),
    listCategoryOptions(userId),
    listPersonOptions(userId),
  ]);

  return {
    accounts: accounts.map((account) => ({
      value: account.id,
      label: account.name,
      currency: account.currency,
    })),
    categories,
    people,
  };
}
