"use client";

import { useState } from "react";
import { Alert, Button, NumberInput, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { TriangleAlert, Wallet } from "lucide-react";

import { invoicePaymentSchema } from "@/lib/validations";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";
import { toCalendarDate } from "@/lib/dates";
import { payInvoice } from "@/actions/invoices";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import { useFormValue } from "@/components/ui/useFormValue";
import type { AccountOption } from "@/lib/options";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
type InvoicePaymentFormValues = {
  accountId: string;
  date: string;
  manualFxRate?: number | undefined;
};

interface PayInvoiceButtonProps {
  invoiceId: string;
  total: number;
  currency: CurrencyCode;
  dueDate: Date;
  accounts: AccountOption[];
  /** Conta padrão do cartão, quando configurada. */
  defaultAccountId: string | null;
}

export function PayInvoiceButton(props: PayInvoiceButtonProps) {
  const { invoiceId, total, currency, dueDate, accounts, defaultAccountId } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Fatura paga",
  });
  const [showManualFx, setShowManualFx] = useState(false);

  const initialValues: InvoicePaymentFormValues = {
    accountId: defaultAccountId ?? accounts[0]?.value ?? "",
    // Sugere o vencimento, não hoje: é a data em que o pagamento costuma cair.
    date: toCalendarDate(dueDate),
    manualFxRate: undefined,
  };

  const form = useForm<InvoicePaymentFormValues>({
    mode: "uncontrolled",
    initialValues,
    validate: zod4Resolver(invoicePaymentSchema),
  });

  const handleOpen = () => {
    form.setValues(initialValues);
    setShowManualFx(false);
    open();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => payInvoice(invoiceId, values), {
      onError: (result) => {
        if (result.needsManualFxRate) {
          setShowManualFx(true);
        }
      },
    });
  });

  const accountId = useFormValue(form, "accountId");
  const selected = accounts.find((account) => account.value === accountId);
  const needsConversion = selected !== undefined && selected.currency !== currency;

  return (
    <>
      <Button
        size="xs"
        variant="light"
        leftSection={<Wallet size={14} />}
        onClick={handleOpen}
        disabled={accounts.length === 0}
      >
        Pagar fatura
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Pagar fatura"
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel={`Pagar ${formatCurrency(total, currency)}`}
      >
        <Text size="sm" c="dimmed">
          O valor sai da conta escolhida como uma despesa consolidada de{" "}
          <strong>{formatCurrency(total, currency)}</strong>.
        </Text>
        <Select
          label="Conta de origem"
          data={accounts}
          allowDeselect={false}
          description={
            needsConversion
              ? `A fatura está em ${currency} e será convertida para ${selected.currency}`
              : undefined
          }
          key={form.key("accountId")}
          {...form.getInputProps("accountId")}
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
                {selected?.currency}.
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
      </FormModal>
    </>
  );
}
