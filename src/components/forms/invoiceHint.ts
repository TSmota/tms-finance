import { monthName, parseCalendarDate } from "@/lib/dates";
import { consecutiveCompetencies, invoiceCompetencyFor } from "@/lib/invoiceCycle";
import { MAX_INSTALLMENTS } from "@/lib/limits";
import type { CardOption } from "@/lib/options";

/**
 * Em que fatura a compra vai cair, pela mesma função que o servidor usa.
 *
 * Sem a prévia, compra depois do fechamento some da fatura que o usuário
 * esperava e só aparece um mês adiante.
 */
export function describeTargetInvoices(
  card: CardOption | undefined,
  date: string,
  installments: number,
): string | null {
  if (!card || !date) {
    return null;
  }

  let purchaseDate: Date;

  try {
    purchaseDate = parseCalendarDate(date);
  } catch {
    return null;
  }

  const count = Number.isInteger(installments) && installments > 0 ? installments : 1;
  const competencies = consecutiveCompetencies(
    invoiceCompetencyFor(card, purchaseDate),
    Math.min(count, MAX_INSTALLMENTS),
  );

  const label = (index: number) => {
    const competency = competencies[index]!;

    return `${monthName(competency.month)}/${competency.year}`;
  };

  return competencies.length === 1
    ? `Entra na fatura de ${label(0)}`
    : `Entra nas faturas de ${label(0)} a ${label(competencies.length - 1)}`;
}