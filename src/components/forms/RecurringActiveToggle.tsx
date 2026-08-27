"use client";

import { useTransition } from "react";
import { Switch } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { setRecurringActive } from "@/actions/recurring";

interface RecurringActiveToggleProps {
  id: string;
  active: boolean;
}

/**
 * Liga e desliga a recorrência.
 *
 * Desativar é diferente de apagar: a definição e o histórico ficam, e apenas os
 * ciclos futuros deixam de ser gerados — é o que se quer para uma assinatura
 * pausada.
 */
export function RecurringActiveToggle(props: RecurringActiveToggleProps) {
  const { id, active } = props;
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      size="sm"
      checked={active}
      disabled={pending}
      aria-label={active ? "Desativar recorrência" : "Ativar recorrência"}
      onChange={(event) => {
        const next = event.currentTarget.checked;

        startTransition(async () => {
          const result = await setRecurringActive(id, next);

          if (!result.ok) {
            notifications.show({ color: "red", message: result.error });
          }
        });
      }}
    />
  );
}
