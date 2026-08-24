"use client";

import { useTransition } from "react";
import { ActionIcon } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Trash2 } from "lucide-react";

import { deleteSettlement } from "@/actions/debts";

interface DeleteSettlementButtonProps {
  id: string;
  description: string;
}

/** Remove uma amortização, devolvendo o valor ao restante da dívida. */
export function DeleteSettlementButton(props: DeleteSettlementButtonProps) {
  const { id, description } = props;
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Remover movimentação",
      centered: true,
      children: `Remover "${description}" devolve o valor ao restante da dívida e reverte o saldo da conta.`,
      labels: { confirm: "Remover", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteSettlement(id);

          notifications.show(
            result.ok
              ? { color: "teal", message: "Movimentação removida" }
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
      aria-label="Remover movimentação"
      loading={pending}
      onClick={handleDelete}
    >
      <Trash2 size={16} />
    </ActionIcon>
  );
}
