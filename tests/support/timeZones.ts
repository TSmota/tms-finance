import { afterEach, it } from "vitest";

/**
 * Aritmética de calendário conferida em vários fusos.
 *
 * O motivo está no ARCHITECTURE.md — seção 3: o resultado tem de ser idêntico
 * em America/Sao_Paulo (máquina de desenvolvimento) e UTC (Vercel). Um helper
 * que usasse componentes locais passaria num e falharia no outro.
 *
 * A restauração é por teste, e não no fim do arquivo, porque `describe`s
 * seguintes herdariam o fuso do último caso. E quando `TZ` não vem do ambiente
 * — o caso do runner do CI — ela é **removida**, não reatribuída: atribuir
 * `undefined` a uma variável de ambiente grava a string `"undefined"`, e o Node
 * cai em UTC em silêncio.
 */
const ORIGINAL_TZ = process.env.TZ;

/** Os fusos que cobrem o que importa: o meridiano, os dois lados dele e o extremo. */
export const TIME_ZONES = ["UTC", "America/Sao_Paulo", "Asia/Tokyo", "Pacific/Kiritimati"];

/** Fixa o fuso do processo; o `afterEach` abaixo o devolve como estava. */
export function setTimeZone(timeZone: string): void {
  process.env.TZ = timeZone;
}

afterEach(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
});

/**
 * Roda o mesmo corpo em cada fuso, um caso de teste por fuso. O corpo é
 * aguardado, e o tipo aceita `Promise<void>` de propósito — o motivo está no
 * ARCHITECTURE.md, seção Testes.
 */
export function itAcrossTimeZones(
  name: string,
  body: () => void | Promise<void>,
  timeZones: string[] = TIME_ZONES,
): void {
  it.each(timeZones)(`${name} — TZ=%s`, async (timeZone) => {
    setTimeZone(timeZone);
    await body();
  });
}
