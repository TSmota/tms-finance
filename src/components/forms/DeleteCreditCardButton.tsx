"use client";

import { useTransition } from "react";
import { ActionIcon } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Trash2 } from "lucide-react";

import { deleteCreditCard } from "@/actions/creditCards";

interface DeleteCreditCardButtonProps {
  id: string;
  name: string;
}

export function DeleteCreditCardButton(props: DeleteCreditCardButtonProps) {
  const { id, name } = props;
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Remover cartão",
      centered: true,
      children: `Remover o cartão ${name} apaga também suas faturas e lançamentos. Tem certeza?`,
      labels: { confirm: "Remover", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteCreditCard(id);

          notifications.show(
            result.ok
              ? { color: "teal", message: "Cartão removido" }
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
      aria-label="Remover cartão"
      loading={pending}
      onClick={handleDelete}
    >
      <Trash2 size={16} />
    </ActionIcon>
  );
}
