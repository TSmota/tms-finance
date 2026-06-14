"use client";

import { useState } from "react";
import { Alert, Button, Modal, NumberInput, Stack } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { TriangleAlert } from "lucide-react";

import { debtPaymentSchema } from "@/lib/validations";
import { addDebtPayment } from "@/actions/debts";

interface AddPaymentButtonProps {
  debtId: string;
}

export function AddPaymentButton(props: AddPaymentButtonProps) {
  const { debtId } = props;

  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
  const [showManualFx, setShowManualFx] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      debtId,
      amount: 0,
      paymentDate: new Date(),
      manualFxRate: undefined as number | undefined,
    },
    validate: zod4Resolver(debtPaymentSchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setLoading(true);
    const res = await addDebtPayment(values);
    setLoading(false);
    if (!res.ok) {
      if (res.needsManualFxRate) setShowManualFx(true);
      notifications.show({ color: "red", message: res.error ?? "Falha ao salvar" });
      return;
    }
    notifications.show({ color: "teal", message: "Pagamento registrado" });
    form.reset();
    setShowManualFx(false);
    close();
  });

  return (
    <>
      <Button variant="light" size="xs" onClick={open}>
        Adicionar pagamento
      </Button>
      <Modal opened={opened} onClose={close} title="Registrar pagamento" centered>
        <form onSubmit={handleSubmit}>
          <Stack>
            <NumberInput
              label="Valor"
              decimalScale={2}
              min={0}
              key={form.key("amount")}
              {...form.getInputProps("amount")}
            />
            <DatePickerInput
              label="Data do pagamento"
              key={form.key("paymentDate")}
              {...form.getInputProps("paymentDate")}
            />
            {showManualFx && (
              <>
                <Alert
                  color="yellow"
                  icon={<TriangleAlert size={16} />}
                  title="Taxa de câmbio manual"
                >
                  O serviço de câmbio está indisponível. Informe a taxa
                  manualmente.
                </Alert>
                <NumberInput
                  label="Taxa de câmbio manual"
                  decimalScale={6}
                  min={0}
                  key={form.key("manualFxRate")}
                  {...form.getInputProps("manualFxRate")}
                />
              </>
            )}
            <Button type="submit" loading={loading}>
              Salvar
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
