import type { ManagedBy } from "@/lib/transactions";

/**
 * Rótulo e explicação de "este lançamento pertence a outro serviço".
 *
 * Fora do componente porque duas telas o usam — a de lançamentos e a de fatura
 * do cartão —, e duas cópias divergem sem ninguém notar. Sem `"use client"`: as
 * duas consumidoras são client, mas nada aqui precisa de runtime de cliente.
 */
export const MANAGED_BY_LABEL: Record<ManagedBy, { label: string; hint: string }> = {
  debt: { label: "Dívida", hint: "Ajuste pela tela de dívidas" },
  invoice: { label: "Fatura", hint: "Desfaça o pagamento pela tela do cartão" },
};