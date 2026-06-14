"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MonthPickerInput } from "@mantine/dates";

export function MonthSelector() {
  const router = useRouter();
  const params = useSearchParams();
  const monthParam = params.get("month");

  const value = monthParam ? new Date(`${monthParam}-01T00:00:00`) : new Date();

  return (
    <MonthPickerInput
      label="Mês"
      value={value}
      maw={220}
      onChange={(date) => {
        if (!date) return;

        const day = new Date(date);
        const yearMonth = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
        router.push(`/dashboard/monthly-costs?month=${yearMonth}`);
      }}
    />
  );
}
