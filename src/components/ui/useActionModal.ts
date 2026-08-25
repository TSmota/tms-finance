"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

/** Formato mínimo de retorno de uma server action. */
type ActionOutcome = { ok: true } | { ok: false; error: string };

interface RunOptions<T extends ActionOutcome> {
  /** Chamado após sucesso, antes do modal fechar. */
  onSuccess?: (result: Extract<T, { ok: true }>) => void;
  /**
   * Chamado após falha. Recebe o ramo de falha já estreitado, para que campos
   * específicos do erro — como `needsManualFxRate` — sejam acessíveis sem cast.
   */
  onError?: (result: Extract<T, { ok: false }>) => void;
}

/**
 * Encapsula o padrão comum a todo formulário em modal: estado de abertura,
 * flag de carregamento, e um `run` que executa a server action, exibe o toast
 * de sucesso ou erro, e fecha o modal apenas em caso de sucesso.
 */
export function useActionModal(options: { successMessage: string }) {
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);

  async function run<T extends ActionOutcome>(
    action: () => Promise<T>,
    runOptions?: RunOptions<T>,
  ): Promise<boolean> {
    setLoading(true);

    try {
      const result = await action();

      if (!result.ok) {
        runOptions?.onError?.(result as Extract<T, { ok: false }>);
        notifications.show({ color: "red", message: result.error });

        return false;
      }

      notifications.show({ color: "teal", message: options.successMessage });
      runOptions?.onSuccess?.(result as Extract<T, { ok: true }>);
      close();

      return true;
    } catch (error) {
      // `redirect()` e `notFound()` sinalizam por exceção — deixe subir.
      unstable_rethrow(error);

      // `runAction` já traduz erro de domínio em `{ ok: false }`; chegar aqui
      // significa falha de rede ou de serialização da server action.
      console.error("Falha ao executar server action:", error);
      notifications.show({
        color: "red",
        message: "Ocorreu um erro inesperado. Tente novamente.",
      });

      return false;
    } finally {
      // `finally` para que uma exceção inesperada não deixe o botão travado
      // em estado de carregamento para sempre.
      setLoading(false);
    }
  }

  return { opened, open, close, loading, run };
}
