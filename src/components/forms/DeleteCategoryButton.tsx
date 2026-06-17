"use client";

import { useTransition } from "react";
import { ActionIcon } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Trash2 } from "lucide-react";

import { deleteCategory } from "@/actions/categories";

interface DeleteCategoryButtonProps {
  id: string;
  name: string;
}

export function DeleteCategoryButton(props: DeleteCategoryButtonProps) {
  const { id, name } = props;
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Remover categoria",
      centered: true,
      children: `Tem certeza que deseja remover a categoria ${name}?`,
      labels: { confirm: "Remover", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteCategory(id);
          if (!result.ok) {
            notifications.show({
              color: "red",
              message: result.error ?? "Falha ao remover categoria",
            });
            return;
          }

          notifications.show({
            color: "teal",
            message: "Categoria removida",
          });
        });
      },
    });
  };

  return (
    <ActionIcon
      variant="subtle"
      color="red"
      aria-label="Remover categoria"
      loading={pending}
      onClick={handleDelete}
    >
      <Trash2 size={16} />
    </ActionIcon>
  );
}
