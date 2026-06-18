"use client";

import { useTransition } from "react";
import { ActionIcon } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Trash2 } from "lucide-react";

import { deleteTransaction } from "@/actions/transactions";

interface DeleteTransactionButtonProps {
  id: string;
  description: string;
}

export function DeleteTransactionButton(props: DeleteTransactionButtonProps) {
  const { id, description } = props;
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Remover transação",
      centered: true,
      children: `Tem certeza que deseja remover a transação "${description}"?`,
      labels: { confirm: "Remover", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteTransaction(id);
          if (!result.ok) {
            notifications.show({
              color: "red",
              message: result.error ?? "Falha ao remover transação",
            });
            return;
          }

          notifications.show({ color: "teal", message: "Transação removida" });
        });
      },
    });
  };

  return (
    <ActionIcon
      variant="subtle"
      color="red"
      aria-label="Remover transação"
      loading={pending}
      onClick={handleDelete}
    >
      <Trash2 size={16} />
    </ActionIcon>
  );
}
