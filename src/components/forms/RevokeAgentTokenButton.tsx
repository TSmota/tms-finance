"use client";

import { useTransition } from "react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Ban } from "lucide-react";

import { revokeAgentToken } from "@/actions/agentTokens";
import { IconButton } from "@/components/ui/IconButton";

interface RevokeAgentTokenButtonProps {
  id: string;
  label: string;
  tokenHint: string;
  disabled?: boolean;
}

export function RevokeAgentTokenButton(props: RevokeAgentTokenButtonProps) {
  const { id, label, tokenHint, disabled = false } = props;
  const [pending, startTransition] = useTransition();

  const handleRevoke = () => {
    modals.openConfirmModal({
      title: "Revogar token de acesso",
      centered: true,
      children: `Deseja revogar o acesso do token "${label}" (${tokenHint}…)? Qualquer agente que utilize esta credencial deixará de funcionar imediatamente. Esta ação não pode ser desfeita.`,
      labels: { confirm: "Revogar acesso", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        startTransition(async () => {
          const result = await revokeAgentToken(id);

          notifications.show(
            result.ok
              ? { color: "teal", message: `Token "${label}" revogado com sucesso` }
              : { color: "red", message: result.error },
          );
        });
      },
    });
  };

  return (
    <IconButton
      label={`Revogar token ${label}`}
      color="red"
      loading={pending}
      onClick={handleRevoke}
      disabled={disabled}
    >
      <Ban size={16} aria-hidden />
    </IconButton>
  );
}
