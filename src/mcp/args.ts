import { z } from "zod";

import { currentCompetency } from "@/lib/dates";

/**
 * Schemas de argumento que só a casca MCP usa.
 *
 * Os schemas de **escrita** não moram aqui: vêm de `@/lib/validations` sem
 * alteração, porque é a fonte única compartilhada com o formulário. O que mora
 * aqui são os parâmetros de consulta, que a UI resolve pela URL.
 */

const COMPETENCY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Competência `YYYY-MM`, ausente = mês corrente.
 *
 * Estrito, ao contrário de `resolveCompetency`, que cai no mês corrente quando
 * a entrada é inválida: lá o valor vem da query string, onde lixo é esperado.
 * Aqui, um agente que mandasse `month: "lixo"` receberia calado um relatório de
 * outro mês e escreveria prosa confiante sobre o número errado.
 */
export const competencySchema = z
  .string()
  .regex(COMPETENCY_PATTERN, "Competência deve estar no formato YYYY-MM")
  .optional();

export function toCompetency(month: string | undefined): { year: number; month: number } {
  if (!month) {
    return currentCompetency();
  }

  const [year, monthPart] = month.split("-");

  return { year: Number(year), month: Number(monthPart) };
}

export const idArg = z.uuid("Identificador inválido");

/** Ferramenta sem parâmetro. Objeto vazio, não `undefined`: o cliente manda `{}`. */
export const noArgs = z.object({});

export const competencyArgs = z.object({ month: competencySchema });

export const idArgs = z.object({ id: idArg });
