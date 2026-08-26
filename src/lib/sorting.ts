/**
 * Ordenação alfabética consciente de acentuação.
 *
 * O Postgres local usa collation `C.UTF-8`, que ordena por byte: "Água" e
 * "Óleo" caem depois de "Zebra". Num app em português, onde categorias e contas
 * frequentemente começam com letra acentuada, toda lista sai errada. Pior, a
 * collation do banco de produção pode ser outra — então `ORDER BY name` produz
 * ordens diferentes por ambiente, o mesmo tipo de divergência que `@/lib/dates`
 * resolve para datas.
 *
 * A solução é ordenar na aplicação com `Intl.Collator`, que é determinístico e
 * independente do banco. As listas ordenadas assim (contas, categorias) têm
 * dezenas de itens, não milhares, então o custo é irrelevante.
 */

/** `sensitivity: "base"` faz "a", "á" e "A" compararem como equivalentes. */
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Comparador para `Array#sort` em objetos que têm `name`. */
export function byName<T extends { name: string }>(a: T, b: T): number {
  return compareNames(a.name, b.name);
}

/** Comparador para `Array#sort` em opções de `Select` (`label`). */
export function byLabel<T extends { label: string }>(a: T, b: T): number {
  return compareNames(a.label, b.label);
}
