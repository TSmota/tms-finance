"use client";

import { useTransition } from "react";
import { ActionIcon } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Trash2 } from "lucide-react";

import { deleteCardPurchase } from "@/actions/cardPurchases";

interface DeleteCardPurchaseButtonProps {
  id: string;
  description: string;
  /** Quando parcelada, o aviso deixa claro que o grupo inteiro sai. */
  totalInstallments: number | null;
}

export function DeleteCardPurchaseButton(props: DeleteCardPurchaseButtonProps) {
  const { id, description, totalInstallments } = props;
  const [pending, startTransition] = useTransition();

  const isInstalled = (totalInstallments ?? 1) > 1;

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Remover compra",
      centered: true,
      children: isInstalled
        ? `"${description}" está parcelada em ${totalInstallments}x. Remover apaga todas as parcelas, em todas as faturas.`
        : `Remover a compra "${description}"?`,
      labels: { confirm: "Remover", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteCardPurchase(id);

          notifications.show(
            result.ok
              ? { color: "teal", message: "Compra removida" }
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
      aria-label="Remover compra"
      loading={pending}
      onClick={handleDelete}
    >
      <Trash2 size={16} />
    </ActionIcon>
  );
}
