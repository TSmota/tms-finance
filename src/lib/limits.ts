/**
 * Limites de domínio compartilhados entre servidor e cliente.
 *
 * Módulo deliberadamente sem imports: é consumido por `validations.ts`, que
 * entra no bundle do navegador. Tê-los em `installments.ts` arrastaria o runtime
 * do Prisma (usado ali para `Decimal.ROUND_DOWN`) para o cliente.
 */

/** Teto de parcelas de uma compra; acima disso é erro de digitação. */
export const MAX_INSTALLMENTS = 120;
