"use client";

import { useTransition } from "react";
import { ActionIcon } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Trash2 } from "lucide-react";

import { deleteRecurringExpense } from "@/actions/recurring";

interface DeleteRecurringButtonProps {
  id: string;
  description: string;
}

export function DeleteRecurringButton(props: DeleteRecurringButtonProps) {
  const { id, description } = props;
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Remover recorrência",
      centered: true,
      children: `Remover "${description}" apaga as pendências ainda não confirmadas e os lançamentos em faturas abertas. O que já foi pago permanece no histórico.`,
      labels: { confirm: "Remover", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteRecurringExpense(id);

          notifications.show(
            result.ok
              ? { color: "teal", message: "Recorrência removida" }
              : { color: "red", message: result.error },
          );
        });
      },
    });
  };

  return (
    <ActionIcon
      variant="subtle"
      color="red"
      aria-label="Remover recorrência"
      loading={pending}
      onClick={handleDelete}
    >
      <Trash2 size={16} />
    </ActionIcon>
  );
}
