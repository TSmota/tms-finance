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
 * Presentational wrapper for modal-based forms: renders a centered Modal with a
 * vertical stack of fields and a loading-aware submit button. Pair with
 * `useActionModal` for open/close state and submission handling.
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
