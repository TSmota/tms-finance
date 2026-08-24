/**
 * A regra de divisão de parcelas, em centavos inteiros.
 *
 * Fonte única, consumida por `@/lib/installments` (servidor, converte de/para
 * `Decimal`) e pela prévia do formulário de compra. Duas implementações fariam
 * a prévia divergir do valor gravado no primeiro ajuste de arredondamento.
 *
 * Sem imports, para poder entrar no bundle do cliente: o `Decimal` do Prisma é
 * server-only.
 *
 * Aritmética de inteiros é exata aqui: `Decimal(12,2)` chega no máximo a
 * ~1×10¹² centavos, bem abaixo do limite seguro de 2⁵³.
 */

/**
 * Divide `totalCents` em `count` parcelas, com os centavos de resto na
 * **primeira** parcela.
 *
 * Não valida: quem chama garante `count >= 1` inteiro e `totalCents >= count`.
 * Ver `splitInstallments` para a versão que valida e lança erro de domínio.
 */
export function splitCents(totalCents: number, count: number): number[] {
  // Piso: nenhuma parcela fica acima da divisão exata, e a diferença — sempre
  // positiva — se concentra na primeira.
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;

  return Array.from({ length: count }, (_, index) => (index === 0 ? base + remainder : base));
}

/**
 * Resumo legível da divisão, para exibir no formulário antes de salvar.
 * Devolve `null` quando não há o que resumir (à vista, ou divisão inviável).
 */
export function describeSplit(
  totalCents: number,
  count: number,
  format: (cents: number) => string,
): string | null {
  if (!Number.isInteger(count) || count < 2 || totalCents < count) {
    return null;
  }

  const parts = splitCents(totalCents, count);
  const first = parts[0]!;
  const rest = parts[1]!;

  if (first === rest) {
    return `${count}× de ${format(rest)}`;
  }

  return `1ª de ${format(first)} e ${count - 1}× de ${format(rest)}`;
}
