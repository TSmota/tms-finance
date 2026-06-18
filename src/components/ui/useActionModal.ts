"use client";

import { useState } from "react";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

interface RunOptions<T> {
  /** Called after a successful action, before the modal closes. */
  onSuccess?: (result: T) => void;
  /** Called after a failed action (e.g. to surface manual FX input). */
  onError?: (result: T) => void;
}

/**
 * Encapsulates the modal + loading + notifications pattern shared by every
 * form modal: open/close state, a `loading` flag, and a `run` helper that
 * executes a server action, shows success/error toasts and closes on success.
 */
export function useActionModal(options: { successMessage: string }) {
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);

  async function run<T extends { ok: boolean; error?: string }>(
    action: () => Promise<T>,
    runOptions?: RunOptions<T>,
  ): Promise<boolean> {
    setLoading(true);
    const result = await action();
    setLoading(false);

    if (!result.ok) {
      runOptions?.onError?.(result);
      notifications.show({
        color: "red",
        message: result.error ?? "Falha ao salvar",
      });
      return false;
    }

    notifications.show({ color: "teal", message: options.successMessage });
    runOptions?.onSuccess?.(result);
    close();
    return true;
  }

  return { opened, open, close, loading, run };
}
