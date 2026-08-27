import { money, type Money, type MoneyInput } from "@/lib/money";
import { compareNames } from "@/lib/sorting";

/**
 * Agregação de valores por categoria **raiz**.
 *
 * Um gasto em "Moradia > Luz" precisa aparecer somado em "Moradia": é a
 * pergunta que o usuário faz, e a subcategoria existe para detalhar, não para
 * fragmentar o relatório.
 *
 * Lógica pura, sem banco: as bordas — categoria apagada, item sem categoria,
 * empate de valor — são onde os erros moram, e assim podem ser testadas sem
 * Postgres.
 */

/** Categoria como o rollup precisa dela. */
export interface CategoryRef {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
}

/** Valor a agregar. `categoryId` nulo cai no grupo "Sem categoria". */
export interface RollupEntry {
  categoryId: string | null;
  value: MoneyInput;
}

export interface CategorySlice {
  /** `null` no grupo dos itens sem categoria. */
  id: string | null;
  name: string;
  color: string | null;
  value: number;
}

/** Rótulo do grupo dos itens sem categoria. */
export const NO_CATEGORY = "Sem categoria";

/**
 * Resolve a categoria raiz de um id.
 *
 * Sobe **um** nível, porque a árvore tem no máximo dois (garantido pelo serviço
 * de categorias). Uma subcategoria cujo pai não está no índice — pai apagado
 * enquanto a página carregava — vira sua própria raiz, em vez de desaparecer do
 * relatório.
 */
export function rootIndex(categories: CategoryRef[]): (id: string) => CategoryRef | null {
  const byId = new Map(categories.map((category) => [category.id, category]));

  return (id: string) => {
    const category = byId.get(id);

    if (!category) {
      return null;
    }

    return category.parentId ? (byId.get(category.parentId) ?? category) : category;
  };
}

/**
 * Soma os valores por categoria raiz, do maior para o menor.
 *
 * Empate é desfeito pelo nome, para que a ordem seja estável entre execuções —
 * sem isso, dois gastos iguais trocariam de lugar a cada renderização.
 *
 * Entradas de valor zero ficam fora: uma fatia de 0% no gráfico é ruído.
 */
export function rollupByCategory(
  categories: CategoryRef[],
  entries: RollupEntry[],
): CategorySlice[] {
  const rootOf = rootIndex(categories);
  const groups = new Map<string, { name: string; color: string | null; value: Money }>();

  for (const entry of entries) {
    const root = entry.categoryId ? rootOf(entry.categoryId) : null;
    const key = root?.id ?? "";
    const existing = groups.get(key);

    if (existing) {
      existing.value = existing.value.plus(entry.value);
      continue;
    }

    groups.set(key, {
      name: root?.name ?? NO_CATEGORY,
      color: root?.color ?? null,
      value: money(entry.value),
    });
  }

  return [...groups.entries()]
    .filter(([, group]) => !group.value.isZero())
    .map(([key, group]) => ({
      id: key === "" ? null : key,
      name: group.name,
      color: group.color,
      value: group.value.toNumber(),
    }))
    .sort((a, b) => b.value - a.value || compareNames(a.name, b.name));
}

/** Soma das fatias, para conferir o total contra o número exibido ao lado. */
export function sliceTotal(slices: CategorySlice[]): number {
  return slices.reduce<Money>((total, slice) => total.plus(slice.value), money(0)).toNumber();
}

/**
 * Limita a quantidade de fatias, agrupando o excedente em "Outras".
 *
 * Vinte categorias produzem um gráfico ilegível e uma legenda maior que ele. As
 * fatias já vêm ordenadas por valor, e a cauda não muda decisão nenhuma.
 *
 * Só agrupa quando sobra mais de uma fatia: trocar a última por "Outras" com o
 * mesmo valor esconderia informação sem economizar espaço.
 */
export function capSlices(
  slices: CategorySlice[],
  max: number,
  otherName = "Outras",
): CategorySlice[] {
  if (max < 1 || slices.length <= max + 1) {
    return slices;
  }

  const kept = slices.slice(0, max);
  const rest = slices.slice(max);
  const total = rest.reduce<Money>((sum, slice) => sum.plus(slice.value), money(0));

  return [
    ...kept,
    { id: null, name: `${otherName} (${rest.length})`, color: null, value: total.toNumber() },
  ];
}
