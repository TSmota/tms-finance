/**
 * Datas-calendário normalizadas em UTC.
 *
 * As colunas de data são `TIMESTAMP(3)` sem fuso. Construir um `Date` a partir
 * de componentes locais (`new Date(2026, 7, 20)`) grava valores diferentes
 * conforme o fuso do servidor: `03:00Z` em America/Sao_Paulo, `00:00Z` em UTC,
 * `15:00Z` do dia anterior em Asia/Tokyo. Isso deslocaria o fechamento de
 * fatura e o recorte mensal entre ambientes.
 *
 * Nenhum módulo constrói `Date` a partir de ano/mês/dia diretamente — tudo
 * passa por aqui, e tudo usa `Date.UTC` / `getUTC*`.
 *
 * No limite cliente↔servidor, datas viajam como string `YYYY-MM-DD`
 * ({@link CalendarDate}), o formato que o `DatePickerInput` emite. Assim o fuso
 * do navegador também sai da conta.
 */

/** Data-calendário sem fuso, no formato `YYYY-MM-DD`. */
export type CalendarDate = string;

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Meia-noite UTC do dia informado. `month` é 1-12.
 *
 * Não faz clamp: dia fora do mês transborda como em `Date.UTC`
 * (31/02 vira 03/03). Use {@link utcDateClamped} quando o dia vem de
 * configuração do usuário, como `closingDay` ou `dueDay`.
 */
export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Quantidade de dias do mês (1-12), já considerando ano bissexto. */
export function lastDayOfMonth(year: number, month: number): number {
  // Dia 0 do mês seguinte é o último dia deste mês.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Meia-noite UTC com o dia limitado ao último dia existente do mês.
 * `utcDateClamped(2026, 2, 31)` devolve 28/02/2026.
 */
export function utcDateClamped(year: number, month: number, day: number): Date {
  return utcDate(year, month, Math.min(day, lastDayOfMonth(year, month)));
}

/** Intervalo semiaberto `[start, end)` do mês, para filtros de data. */
export function monthRange(year: number, month: number): { start: Date; end: Date } {
  const next = addMonths(year, month, 1);

  return { start: utcDate(year, month, 1), end: utcDate(next.year, next.month, 1) };
}

/** Competência deslocada em `offset` meses, com virada de ano. */
export function addMonths(
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } {
  // -1/+1 converte entre mês 1-12 e o índice 0-11 usado na aritmética.
  const index = (year * 12 + (month - 1)) + offset;

  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Converte `YYYY-MM-DD` em meia-noite UTC.
 *
 * Rejeita datas inexistentes (`2026-02-30`), que o construtor de `Date`
 * aceitaria silenciosamente transbordando para o mês seguinte.
 */
export function parseCalendarDate(value: string): Date {
  const match = CALENDAR_DATE_PATTERN.exec(value);

  if (!match) {
    throw new RangeError(`Data inválida: "${value}" (esperado YYYY-MM-DD)`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth(year, month)) {
    throw new RangeError(`Data inexistente: "${value}"`);
  }

  return utcDate(year, month, day);
}

/** Extrai a data-calendário de um `Date`, lendo os componentes em UTC. */
export function toCalendarDate(date: Date): CalendarDate {
  return date.toISOString().slice(0, 10);
}

/** Competência (ano + mês 1-12) de um `Date`, lida em UTC. */
export function competencyOf(date: Date): { year: number; month: number } {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/**
 * Data-calendário de hoje segundo o relógio **local** de quem chama.
 *
 * Única função do módulo que usa componentes locais de propósito: "hoje" é um
 * conceito do fuso do usuário. Às 22h do dia 20 em São Paulo já é dia 21 em
 * UTC, e oferecer 21 como data padrão estaria errado para ele.
 */
export function todayCalendarDate(now: Date = new Date()): CalendarDate {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Competência do mês corrente segundo o relógio local. */
export function currentCompetency(now: Date = new Date()): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Nome do mês em pt-BR, minúsculo. `month` é 1-12. */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1]!;
}

/**
 * Dia em pt-BR. `timeZone: "UTC"` pelo mesmo motivo do resto do módulo: a
 * coluna é data-calendário, e sem isso quem está a oeste de Greenwich vê o dia
 * anterior.
 */
export function formatDay(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
