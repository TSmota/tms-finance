"use client";

import { useState } from "react";
import { Alert, Button, NumberInput, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Check, TriangleAlert } from "lucide-react";

import { confirmOccurrenceSchema } from "@/lib/validations";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";
import { toCalendarDate } from "@/lib/dates";
import { confirmPendingTransaction } from "@/actions/recurring";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
type ConfirmFormValues = {
  amount: number;
  date: string;
  manualFxRate?: number | undefined;
};

interface ConfirmPendingButtonProps {
  id: string;
  description: string;
  /** Valor projetado, na moeda do lançamento. */
  amount: number;
  currency: CurrencyCode;
  /** Moeda da conta que será debitada; diferente da acima exige conversão. */
  accountCurrency: CurrencyCode;
  date: Date;
  /** Valor variável: o campo abre em destaque, para ser conferido. */
  isEstimated: boolean;
  compact?: boolean;
}

/**
 * Confirma uma pendência, ajustando o valor real do vencimento.
 *
 * A projeção usou a estimativa; a confirmação usa o valor que realmente chegou.
 * Só neste momento o dinheiro sai do saldo.
 */
export function ConfirmPendingButton(props: ConfirmPendingButtonProps) {
  const { id, description, amount, currency, accountCurrency, date, isEstimated, compact } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Pendência confirmada",
  });
  const [showManualFx, setShowManualFx] = useState(false);

  const initialValues: ConfirmFormValues = {
    amount,
    date: toCalendarDate(date),
    manualFxRate: undefined,
  };

  const form = useForm<ConfirmFormValues>({
    mode: "uncontrolled",
    initialValues,
    validate: zod4Resolver(confirmOccurrenceSchema),
  });

  const handleOpen = () => {
    form.setValues(initialValues);
    setShowManualFx(false);
    open();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => confirmPendingTransaction(id, values), {
      onError: (result) => {
        if (result.needsManualFxRate) {
          setShowManualFx(true);
        }
      },
    });
  });

  const needsConversion = currency !== accountCurrency;

  return (
    <>
      <Button
        size={compact ? "compact-xs" : "xs"}
        variant="light"
        color="teal"
        leftSection={<Check size={14} />}
        onClick={handleOpen}
      >
        Confirmar
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Confirmar pendência"
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="Confirmar e debitar"
      >
        <Text size="sm" c="dimmed">
          {description} — projetado em{" "}
          <strong>{formatCurrency(amount, currency)}</strong>. O valor confirmado é o que sai do
          saldo.
        </Text>
        {isEstimated && (
          <Alert color="blue" variant="light">
            <Text size="sm">
              Esta recorrência está marcada como valor estimado. Confira o valor real antes de
              confirmar.
            </Text>
          </Alert>
        )}
        <NumberInput
          label={`Valor real em ${currency}`}
          decimalScale={2}
          min={0}
          thousandSeparator="."
          decimalSeparator=","
          key={form.key("amount")}
          {...form.getInputProps("amount")}
        />
        <DatePickerInput
          label="Data do pagamento"
          valueFormat="DD/MM/YYYY"
          key={form.key("date")}
          {...form.getInputProps("date")}
        />
        {showManualFx && (
          <>
            <Alert color="yellow" icon={<TriangleAlert size={16} />} title="Taxa de câmbio manual">
              <Text size="sm">
                O serviço de câmbio está indisponível. Informe a taxa de {currency} para{" "}
                {accountCurrency}.
              </Text>
            </Alert>
            <NumberInput
              label="Taxa de câmbio"
              decimalScale={4}
              min={0}
              key={form.key("manualFxRate")}
              {...form.getInputProps("manualFxRate")}
            />
          </>
        )}
        {needsConversion && !showManualFx && (
          <Text size="xs" c="dimmed">
            Será convertido de {currency} para {accountCurrency}, a moeda da conta.
          </Text>
        )}
      </FormModal>
    </>
  );
}
