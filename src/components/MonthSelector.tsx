"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MonthPickerInput } from "@mantine/dates";

import { resolveCompetency } from "@/lib/competency";

/**
 * Seletor de competência. O valor vive na query string (`?month=YYYY-MM`) para
 * que a página seja um Server Component simples e o mês sobreviva a recarga e
 * compartilhamento de link.
 *
 * Usa string, não `Date`: o `MonthPickerInput` do Mantine 9 já trabalha com
 * data-calendário sem fuso, o que evita a divergência descrita em `@/lib/dates`.
 */
export function MonthSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Pela mesma regra do servidor, e não só por causa de URL manipulada: sem ela
  // `?month=2026-9` rende "setembro" no rótulo com os números de agosto, porque
  // o servidor recusa o mês sem zero à esquerda e cai no corrente.
  const { year, month } = resolveCompetency(params.get("month") ?? undefined);
  const value = `${year}-${String(month).padStart(2, "0")}-01`;

  return (
    <MonthPickerInput
      label="Mês"
      value={value}
      maw={220}
      valueFormat="MMMM [de] YYYY"
      onChange={(next) => {
        if (!next) {
          return;
        }

        // `next` é "YYYY-MM-DD"; a competência é o prefixo "YYYY-MM".
        router.push(`${pathname}?month=${next.slice(0, 7)}`);
      }}
    />
  );
}
