"use client";

import { useTransition } from "react";
import { Button } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Undo2 } from "lucide-react";

import { undoInvoicePayment } from "@/actions/invoices";

interface UndoInvoicePaymentButtonProps {
  invoiceId: string;
}

export function UndoInvoicePaymentButton(props: UndoInvoicePaymentButtonProps) {
  const { invoiceId } = props;
  const [pending, startTransition] = useTransition();

  const handleUndo = () => {
    modals.openConfirmModal({
      title: "Desfazer pagamento",
      centered: true,
      children:
        "O valor volta para a conta de origem e a fatura é reaberta. Use isto se o pagamento foi registrado na conta errada.",
      labels: { confirm: "Desfazer", cancel: "Cancelar" },
      confirmProps: { color: "orange" },
      onConfirm: () => {
        startTransition(async () => {
          const result = await undoInvoicePayment(invoiceId);

          notifications.show(
            result.ok
              ? { color: "teal", message: "Pagamento desfeito" }
              : { color: "red", message: result.error },
          );
        });
      },
    });
  };

  return (
    <Button
      size="xs"
      variant="subtle"
      color="gray"
      leftSection={<Undo2 size={14} />}
      loading={pending}
      onClick={handleUndo}
    >
      Desfazer pagamento
    </Button>
  );
}
