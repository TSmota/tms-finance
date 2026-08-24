import { addMonths, competencyOf, lastDayOfMonth, utcDate, utcDateClamped } from "@/lib/dates";
import { InvalidOperationError } from "@/lib/errors";

/**
 * Calendário de um gasto recorrente, sem banco.
 *
 * Separado de `@/lib/recurring` porque as bordas de calendário — fevereiro, dia
 * 31, virada de ano, semana que atravessa o mês — são onde os erros moram, e
 * assim podem ser testadas sem Postgres.
 *
 * Client-safe: não importa nada do runtime do Prisma.
 */

export type Frequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RecurrenceRule {
  frequency: Frequency;
  /**
   * Dia do vencimento, 1-31, com clamp no último dia do mês.
   *
   * Ignorado em `WEEKLY`: uma recorrência semanal não tem dia do mês, ela segue
   * o **dia da semana de `startDate`**. O campo continua obrigatório no banco
   * porque o schema é compartilhado pelas três periodicidades.
   */
  dueDay: number;
  /** Primeira data válida. Nenhuma ocorrência é gerada antes dela. */
  startDate: Date;
  /** Última data válida, inclusive. `null` = sem fim. */
  endDate: Date | null;
  active: boolean;
}

/** Rótulos em pt-BR, para `Select`s e badges. Client-safe. */
export const FREQUENCY_LABELS: Record<Frequency, string> = {
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
  YEARLY: "Anual",
};

export const FREQUENCY_OPTIONS = (["MONTHLY", "WEEKLY", "YEARLY"] as const).map((value) => ({
  value,
  label: FREQUENCY_LABELS[value],
}));

const MS_PER_DAY = 86_400_000;
const WEEK_IN_MS = 7 * MS_PER_DAY;

export function assertValidRule(rule: RecurrenceRule): void {
  if (!Number.isInteger(rule.dueDay) || rule.dueDay < 1 || rule.dueDay > 31) {
    throw new InvalidOperationError("O dia do vencimento deve estar entre 1 e 31");
  }

  if (rule.endDate && rule.endDate.getTime() < rule.startDate.getTime()) {
    throw new InvalidOperationError("A data final não pode ser anterior à inicial");
  }
}

/**
 * Datas de vencimento que a recorrência produz numa competência, em ordem
 * crescente.
 *
 * Devolve lista vazia — e não erro — quando a competência está fora da vigência
 * ou a recorrência está desativada: "este mês não gera nada" é resposta normal,
 * não excepção.
 */
export function occurrencesInMonth(
  rule: RecurrenceRule,
  year: number,
  month: number,
): Date[] {
  assertValidRule(rule);

  if (!rule.active) {
    return [];
  }

  const candidates = rawOccurrences(rule, year, month);
  const from = rule.startDate.getTime();
  const to = rule.endDate?.getTime() ?? Number.POSITIVE_INFINITY;

  return candidates.filter((date) => {
    const time = date.getTime();

    return time >= from && time <= to;
  });
}

/** Ocorrências da competência antes de aplicar vigência e `active`. */
function rawOccurrences(rule: RecurrenceRule, year: number, month: number): Date[] {
  if (rule.frequency === "MONTHLY") {
    return [utcDateClamped(year, month, rule.dueDay)];
  }

  if (rule.frequency === "YEARLY") {
    // O mês do aniversário vem de `startDate`; o dia, de `dueDay`.
    const anniversary = competencyOf(rule.startDate).month;

    return month === anniversary ? [utcDateClamped(year, month, rule.dueDay)] : [];
  }

  return weeklyOccurrences(rule.startDate, year, month);
}

/**
 * Múltiplos de 7 dias a partir de `startDate` que caem na competência.
 *
 * Aritmética em milissegundos, e não somando dias num `Date` local: todas as
 * datas do sistema são meia-noite UTC, onde o dia tem sempre 86.400.000 ms —
 * em fuso local, o dia de mudança de horário de verão tem 23 ou 25 horas e a
 * progressão semanal escorregaria.
 */
function weeklyOccurrences(startDate: Date, year: number, month: number): Date[] {
  const monthStart = utcDate(year, month, 1).getTime();
  const monthEnd = utcDate(year, month, lastDayOfMonth(year, month)).getTime();
  const start = startDate.getTime();

  // Primeira ocorrência que não é anterior ao início do mês.
  const skippedWeeks = start >= monthStart ? 0 : Math.ceil((monthStart - start) / WEEK_IN_MS);

  const dates: Date[] = [];

  for (let time = start + skippedWeeks * WEEK_IN_MS; time <= monthEnd; time += WEEK_IN_MS) {
    dates.push(new Date(time));
  }

  return dates;
}

/**
 * Competências a materializar para chegar em `target`, do watermark em diante.
 *
 * `materializedThrough` é o `lastGeneratedAt` da recorrência: tudo até aquela
 * data já foi gerado. `null` significa que nada foi gerado ainda, e a janela
 * começa na competência de `startDate`.
 *
 * Devolve lista vazia quando `target` já está coberto — é o que torna a
 * materialização barata no caso comum, em que o usuário abre o mês pela segunda
 * vez.
 *
 * O limite `maxMonths` existe para que uma recorrência antiga sem watermark não
 * gere centenas de lançamentos de uma vez; nesse caso a janela é truncada pelo
 * fim, e as competências mais antigas são abandonadas de propósito, porque
 * pendências de anos atrás não têm utilidade.
 */
export function competenciesToMaterialize(params: {
  startDate: Date;
  materializedThrough: Date | null;
  target: { year: number; month: number };
  maxMonths: number;
}): { year: number; month: number }[] {
  const { startDate, materializedThrough, target, maxMonths } = params;

  const first = materializedThrough
    ? addMonths(
        competencyOf(materializedThrough).year,
        competencyOf(materializedThrough).month,
        1,
      )
    : competencyOf(startDate);

  const distance = monthIndex(target) - monthIndex(first);

  if (distance < 0) {
    return [];
  }

  const count = Math.min(distance + 1, maxMonths);
  // Trunca pelo início: as competências mantidas são as `count` mais recentes.
  const begin = addMonths(target.year, target.month, -(count - 1));

  return Array.from({ length: count }, (_, index) =>
    addMonths(begin.year, begin.month, index),
  );
}

/** Índice absoluto de meses, para comparar competências. */
function monthIndex(competency: { year: number; month: number }): number {
  return competency.year * 12 + (competency.month - 1);
}
