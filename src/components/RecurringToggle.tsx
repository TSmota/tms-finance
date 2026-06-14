"use client";

import { Switch } from "@mantine/core";
import { useState, useTransition } from "react";
import { notifications } from "@mantine/notifications";

import { toggleRecurringActive } from "@/actions/recurring";

interface RecurringToggleProps {
  id: string;
  active: boolean;
}

export function RecurringToggle({ id, active }: RecurringToggleProps) {
  const [checked, setChecked] = useState(active);
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={checked}
      disabled={pending}
      onChange={(event) => {
        const next = event.currentTarget.checked;
        setChecked(next);
        startTransition(async () => {
          const res = await toggleRecurringActive(id);

          if (!res.ok) {
            setChecked(!next);
            notifications.show({ color: "red", message: res.error ?? "Erro ao atualizar recorrência" });
          }
        });
      }}
    />
  );
}
