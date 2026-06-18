"use client";

import { useState } from "react";
import { Alert, Button, NumberInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus, TriangleAlert } from "lucide-react";

import { debtPaymentSchema } from "@/lib/validations";
import { addDebtPayment } from "@/actions/debts";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

interface AddPaymentButtonProps {
  debtId: string;
}

export function AddPaymentButton(props: AddPaymentButtonProps) {
  const { debtId } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Pagamento registrado",
  });
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
    await run(() => addDebtPayment(values), {
      onSuccess: () => {
        form.reset();
        setShowManualFx(false);
      },
      onError: (res) => {
        if (res.needsManualFxRate) setShowManualFx(true);
      },
    });
  });

  return (
    <>
      <Button
        variant="light"
        size="xs"
        mt="md"
        leftSection={<Plus size={14} />}
        onClick={open}
      >
        Adicionar pagamento
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Registrar pagamento"
        onSubmit={handleSubmit}
        loading={loading}
      >
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
              O serviço de câmbio está indisponível. Informe a taxa manualmente.
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
      </FormModal>
    </>
  );
}
