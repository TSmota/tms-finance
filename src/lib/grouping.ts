import { compareNames } from "@/lib/sorting";

/**
 * Agrupamento por instituição, usado nas telas de contas e de cartões.
 *
 * Vive aqui, e não na página, porque a regra de ordenação tem uma sutileza que
 * merece teste: o grupo dos itens sem instituição vai sempre para o fim, para
 * não competir por posição alfabética com os bancos reais.
 */

/** Rótulo do grupo dos itens sem instituição informada. */
export const NO_INSTITUTION = "Sem instituição";

export interface Grouped<T> {
  institution: string;
  items: T[];
}

export function groupByInstitution<T extends { institution: string | null }>(
  items: T[],
): Array<Grouped<T>> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = item.institution ?? NO_INSTITUTION;
    const existing = groups.get(key);

    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return [...groups.entries()]
    .map(([institution, groupItems]) => ({ institution, items: groupItems }))
    .sort((a, b) => {
      if (a.institution === NO_INSTITUTION) {
        return 1;
      }
      if (b.institution === NO_INSTITUTION) {
        return -1;
      }

      return compareNames(a.institution, b.institution);
    });
}
