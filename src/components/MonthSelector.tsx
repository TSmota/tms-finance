"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MonthPickerInput } from "@mantine/dates";

import { currentCompetency } from "@/lib/dates";

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

  const monthParam = params.get("month");
  const { year, month } = currentCompetency();
  const fallback = `${year}-${String(month).padStart(2, "0")}`;
  const value = `${monthParam ?? fallback}-01`;

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
