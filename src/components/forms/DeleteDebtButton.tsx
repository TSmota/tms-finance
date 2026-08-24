"use client";

import { useTransition } from "react";
import { ActionIcon } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Trash2 } from "lucide-react";

import { deleteDebt } from "@/actions/debts";

interface DeleteDebtButtonProps {
  id: string;
  description: string;
  /** Amortizações já lançadas, para o aviso dizer o que será revertido. */
  settlementCount: number;
}

export function DeleteDebtButton(props: DeleteDebtButtonProps) {
  const { id, description, settlementCount } = props;
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Remover dívida",
      centered: true,
      children:
        settlementCount > 0
          ? `Remover "${description}" apaga o empréstimo e ${settlementCount} ${settlementCount === 1 ? "movimentação" : "movimentações"}, devolvendo os saldos das contas ao que eram.`
          : `Remover "${description}" apaga o lançamento que a originou e devolve o saldo da conta.`,
      labels: { confirm: "Remover", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteDebt(id);

          notifications.show(
            result.ok
              ? { color: "teal", message: "Dívida removida" }
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
      aria-label="Remover dívida"
      loading={pending}
      onClick={handleDelete}
    >
      <Trash2 size={16} />
    </ActionIcon>
  );
}
