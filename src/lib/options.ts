import type { Currency } from "@prisma/client";

/**
 * Formato das opções de `Select` que os serviços já devolvem prontas.
 *
 * Mora em `src/lib/` porque `creditCards.ts` está no grafo do endpoint MCP, que
 * não tem formulário nenhum: a camada de serviço não pode depender de um módulo
 * de `src/components/` para descrever a própria saída.
 */

/** Opção simples de `Select` do Mantine. */
export interface Option {
  value: string;
  label: string;
}

/**
 * Opção que carrega a moeda nativa do destino — conta ou cartão —, para que o
 * formulário já sugira a moeda certa ao trocar a seleção.
 */
export interface AccountOption extends Option {
  currency: Currency;
}

/**
 * Opção de cartão que carrega o ciclo de faturamento.
 *
 * É o que permite ao formulário dizer, antes de enviar, em que fatura a compra
 * vai cair: a regra é pura e o mesmo módulo (`@/lib/invoiceCycle`) roda nos dois
 * lados.
 */
export interface CardOption extends AccountOption {
  closingDay: number;
  dueDay: number;
}
