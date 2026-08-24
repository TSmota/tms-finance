"use client";

import { useTransition } from "react";
import { ActionIcon } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Trash2 } from "lucide-react";

import { deletePerson } from "@/actions/people";

interface DeletePersonButtonProps {
  id: string;
  name: string;
  /** Com posição em aberto o serviço recusa; o botão avisa antes. */
  openDebts: number;
}

export function DeletePersonButton(props: DeletePersonButtonProps) {
  const { id, name, openDebts } = props;
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Remover pessoa",
      centered: true,
      children:
        openDebts > 0
          ? `${name} tem ${openDebts} ${openDebts === 1 ? "dívida" : "dívidas"} em aberto. Quite ou remova as dívidas antes de remover a pessoa.`
          : `Remover ${name}? O histórico de dívidas quitadas sai junto; os lançamentos no fluxo de caixa permanecem.`,
      labels: { confirm: "Remover", cancel: "Cancelar" },
      confirmProps: { color: "red", disabled: openDebts > 0 },
      onConfirm: () => {
        startTransition(async () => {
          const result = await deletePerson(id);

          notifications.show(
            result.ok
              ? { color: "teal", message: "Pessoa removida" }
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
      aria-label="Remover pessoa"
      loading={pending}
      onClick={handleDelete}
    >
      <Trash2 size={16} />
    </ActionIcon>
  );
}
