import { currentCompetency } from "@/lib/dates";

/**
 * Competência vinda da query string (`?month=YYYY-MM`).
 *
 * Qualquer coisa fora do formato cai no mês corrente em vez de erro: o valor vem
 * da URL, então entrada inválida é esperada, não excepcional.
 *
 * Client-safe: só depende de `@/lib/dates`.
 */
const MONTH_PARAM_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function resolveCompetency(month: string | undefined): { year: number; month: number } {
  const match = month ? MONTH_PARAM_PATTERN.exec(month) : null;

  if (!match) {
    return currentCompetency();
  }

  return { year: Number(match[1]), month: Number(match[2]) };
}
