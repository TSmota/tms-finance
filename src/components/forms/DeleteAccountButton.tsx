"use client";

import { useTransition } from "react";
import { ActionIcon } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Trash2 } from "lucide-react";

import { deleteAccount } from "@/actions/accounts";

interface DeleteAccountButtonProps {
  id: string;
  name: string;
}

export function DeleteAccountButton(props: DeleteAccountButtonProps) {
  const { id, name } = props;
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Remover conta",
      centered: true,
      children: `Tem certeza que deseja remover a conta ${name}?`,
      labels: { confirm: "Remover", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteAccount(id);
          if (!result.ok) {
            notifications.show({
              color: "red",
              message: result.error ?? "Falha ao remover conta",
            });
            return;
          }

          notifications.show({
            color: "teal",
            message: "Conta removida",
          });
        });
      },
    });
  };

  return (
    <ActionIcon
      variant="subtle"
      color="red"
      aria-label="Remover conta"
      loading={pending}
      onClick={handleDelete}
    >
      <Trash2 size={16} />
    </ActionIcon>
  );
}
