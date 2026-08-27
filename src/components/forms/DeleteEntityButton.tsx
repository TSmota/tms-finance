"use client";

import { useTransition } from "react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Trash2 } from "lucide-react";

import type { ActionResult } from "@/actions/types";
import { DeletionImpactPreview } from "@/components/ui/DeletionImpactPreview";
import { IconButton } from "@/components/ui/IconButton";
import type { DeletionTarget } from "@/lib/deletionImpact";

interface DeleteEntityButtonProps {
  id: string;
  /** "Remover cartão": título do modal e rótulo acessível do botão. */
  title: string;
  /** "Cartão removido": o gênero varia, então não dá para derivar do título. */
  successMessage: string;
  /** Pergunta do modal, já com o nome do recurso e o que a remoção leva junto. */
  question: string;
  action: (id: string) => Promise<ActionResult>;
  /** Preenchido = o modal mede o impacto real antes de deixar confirmar. */
  impactTarget?: DeletionTarget;
  /** Recusa que a tela já conhece: desabilita "Remover" antes de medir. */
  blocked?: boolean;
  /** Desabilita também o botão que abre o modal. */
  disabled?: boolean;
}

/**
 * Único botão de remoção do app.
 *
 * O `modalId` é obrigatório para `DeletionImpactPreview` desabilitar o
 * "Remover", e derivá-lo do `id` aqui é o que impede que as duas pontas
 * declarem ids diferentes e o botão siga habilitado sobre um impacto
 * bloqueado.
 */
export function DeleteEntityButton(props: DeleteEntityButtonProps) {
  const {
    id,
    title,
    successMessage,
    question,
    action,
    impactTarget,
    blocked = false,
    disabled = false,
  } = props;
  const [pending, startTransition] = useTransition();
  const modalId = `remove-${id}`;

  const handleDelete = () => {
    modals.openConfirmModal({
      modalId,
      title,
      centered: true,
      children: impactTarget ? (
        <DeletionImpactPreview
          target={impactTarget}
          id={id}
          modalId={modalId}
          question={question}
        />
      ) : (
        question
      ),
      labels: { confirm: "Remover", cancel: "Cancelar" },
      confirmProps: { color: "red", disabled: blocked },
      onConfirm: () => {
        startTransition(async () => {
          const result = await action(id);

          notifications.show(
            result.ok
              ? { color: "teal", message: successMessage }
              : { color: "red", message: result.error },
          );
        });
      },
    });
  };

  return (
    <IconButton
      label={title}
      color="red"
      loading={pending}
      onClick={handleDelete}
      disabled={disabled}
    >
      <Trash2 size={16} />
    </IconButton>
  );
}
