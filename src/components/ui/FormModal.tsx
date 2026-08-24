"use client";

import { Button, Modal, Stack } from "@mantine/core";
import type { FormEvent, ReactNode } from "react";

interface FormModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  submitLabel?: string;
  children: ReactNode;
}

/**
 * Casca visual dos formulários em modal: campos empilhados e botão de envio
 * ciente do carregamento. Use com `useActionModal`, que cuida do estado.
 */
export function FormModal(props: FormModalProps) {
  const {
    opened,
    onClose,
    title,
    onSubmit,
    loading,
    submitLabel = "Salvar",
    children,
  } = props;

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <form onSubmit={onSubmit}>
        <Stack>
          {children}
          <Button type="submit" loading={loading}>
            {submitLabel}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
