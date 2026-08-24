import { addMonths, competencyOf, lastDayOfMonth, utcDateClamped } from "@/lib/dates";
import { InvalidOperationError } from "@/lib/errors";

/**
 * Ciclo de faturamento do cartão.
 *
 * Lógica pura, sem banco: o cartão guarda apenas o *dia* de fechamento e de
 * vencimento, e é aqui que esses dias viram as datas efetivas de cada
 * competência. Separado de `@/lib/invoices` para poder ser testado nas bordas —
 * virada de mês, virada de ano, fevereiro, dia 31.
 */

export interface Competency {
  year: number;
  /** 1-12. */
  month: number;
}

export interface CardCycle {
  closingDay: number;
  dueDay: number;
}

export function assertValidCycle(cycle: CardCycle): void {
  const inRange = (day: number) => Number.isInteger(day) && day >= 1 && day <= 31;

  if (!inRange(cycle.closingDay) || !inRange(cycle.dueDay)) {
    throw new InvalidOperationError("Dia de fechamento e de vencimento devem estar entre 1 e 31");
  }
}

/**
 * Competência da fatura em que uma compra cai.
 *
 * Compra **depois** do dia de fechamento entra na fatura do mês seguinte; no
 * próprio dia do fechamento ainda entra na fatura corrente.
 *
 * Quando o dia de fechamento não existe no mês (31 em fevereiro), vale o último
 * dia do mês.
 */
export function invoiceCompetencyFor(cycle: CardCycle, purchaseDate: Date): Competency {
  assertValidCycle(cycle);

  const { year, month } = competencyOf(purchaseDate);
  const effectiveClosingDay = Math.min(cycle.closingDay, lastDayOfMonth(year, month));

  if (purchaseDate.getUTCDate() <= effectiveClosingDay) {
    return { year, month };
  }

  return addMonths(year, month, 1);
}

/**
 * Datas efetivas de fechamento e vencimento de uma competência.
 *
 * O vencimento cai no mês seguinte ao fechamento quando o dia de vencimento é
 * menor ou igual ao de fechamento — o caso comum de "fecha dia 20, vence dia 5".
 * Quando é maior, vence no mesmo mês ("fecha dia 5, vence dia 20").
 */
export function invoiceCycleDates(
  cycle: CardCycle,
  competency: Competency,
): { closingDate: Date; dueDate: Date } {
  assertValidCycle(cycle);

  const closingDate = utcDateClamped(competency.year, competency.month, cycle.closingDay);

  const dueCompetency =
    cycle.dueDay > cycle.closingDay
      ? competency
      : addMonths(competency.year, competency.month, 1);

  const dueDate = utcDateClamped(dueCompetency.year, dueCompetency.month, cycle.dueDay);

  return { closingDate, dueDate };
}

/**
 * Competências consecutivas a partir de uma inicial, para distribuir as
 * parcelas de uma compra.
 */
export function consecutiveCompetencies(start: Competency, count: number): Competency[] {
  return Array.from({ length: count }, (_, index) =>
    addMonths(start.year, start.month, index),
  );
}
