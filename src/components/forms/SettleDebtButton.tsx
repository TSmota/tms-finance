"use client";

import { useState } from "react";
import { Alert, Button, NumberInput, Select, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { HandCoins, TriangleAlert } from "lucide-react";

import { debtSettlementSchema } from "@/lib/validations";
import { CURRENCY_OPTIONS, formatCurrency, type CurrencyCode } from "@/lib/currency";
import { todayCalendarDate } from "@/lib/dates";
import { DEBT_SETTLEMENT_LABELS, type DebtTypeCode } from "@/lib/debtTypes";
import { settleDebt } from "@/actions/debts";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import { useFormValue } from "@/components/ui/useFormValue";
import type { AccountOption, Option } from "@/lib/options";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
type SettlementFormValues = {
  amount: number;
  currency: string;
  accountId: string;
  date: string;
  categoryId: string;
  description: string;
  manualFxRate?: number | undefined;
  manualDebtFxRate?: number | undefined;
};

interface SettleDebtButtonProps {
  debtId: string;
  type: DebtTypeCode;
  /** Restante, na moeda da dívida — o teto do que se pode abater. */
  remainingAmount: number;
  currency: CurrencyCode;
  accounts: AccountOption[];
  categories: Option[];
  /** Categoria de origem, herdada quando o usuário não escolhe outra. */
  defaultCategoryId: string;
  /** Conta da movimentação de origem, para onde o dinheiro tende a voltar. */
  defaultAccountId: string | null;
  compact?: boolean;
}

/** Registra um abate da dívida. Sugere o restante inteiro. */
export function SettleDebtButton(props: SettleDebtButtonProps) {
  const {
    debtId,
    type,
    remainingAmount,
    currency,
    accounts,
    categories,
    defaultCategoryId,
    defaultAccountId,
    compact,
  } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: type === "LENT" ? "Recebimento registrado" : "Pagamento registrado",
  });
  const [showManualFx, setShowManualFx] = useState(false);

  const initialValues: SettlementFormValues = {
    amount: remainingAmount,
    currency,
    accountId:
      accounts.find((account) => account.value === defaultAccountId)?.value ??
      accounts[0]?.value ??
      "",
    date: todayCalendarDate(),
    categoryId: "",
    description: "",
    manualFxRate: undefined,
    manualDebtFxRate: undefined,
  };

  const form = useForm<SettlementFormValues>({
    mode: "uncontrolled",
    initialValues,
    validate: zod4Resolver(debtSettlementSchema),
  });

  const handleOpen = () => {
    form.setValues(initialValues);
    setShowManualFx(false);
    open();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => settleDebt(debtId, values), {
      onError: (result) => {
        if (result.needsManualFxRate) {
          setShowManualFx(true);
        }
      },
    });
  });

  const settlementCurrency = useFormValue(form, "currency");
  const accountId = useFormValue(form, "accountId");
  const accountCurrency = accounts.find((account) => account.value === accountId)?.currency;
  const inheritedLabel =
    categories.find((category) => category.value === defaultCategoryId)?.label ?? "a de origem";
  // Cada conversão que exista ganha o seu campo.
  const needsAccountRate = Boolean(accountCurrency) && settlementCurrency !== accountCurrency;
  const needsDebtRate = settlementCurrency !== currency;

  return (
    <>
      <Button
        size={compact ? "compact-xs" : "xs"}
        variant="light"
        color="teal"
        leftSection={<HandCoins size={14} />}
        onClick={handleOpen}
        disabled={accounts.length === 0 || remainingAmount <= 0}
      >
        {DEBT_SETTLEMENT_LABELS[type]}
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title={DEBT_SETTLEMENT_LABELS[type]}
        onSubmit={handleSubmit}
        loading={loading}
      >
        <Text size="sm" c="dimmed">
          Restam <strong>{formatCurrency(remainingAmount, currency)}</strong>. O valor informado
          abate esse saldo e{" "}
          {type === "LENT" ? "entra na conta escolhida" : "sai da conta escolhida"}.
        </Text>
        <NumberInput
          label="Valor"
          decimalScale={2}
          min={0}
          thousandSeparator="."
          decimalSeparator=","
          key={form.key("amount")}
          {...form.getInputProps("amount")}
        />
        <Select
          label="Moeda"
          description={
            settlementCurrency === currency
              ? undefined
              : `Será convertido para ${currency} ao abater a dívida`
          }
          data={CURRENCY_OPTIONS}
          allowDeselect={false}
          key={form.key("currency")}
          {...form.getInputProps("currency")}
        />
        <Select
          label={type === "LENT" ? "Conta de destino" : "Conta de origem"}
          data={accounts}
          allowDeselect={false}
          key={form.key("accountId")}
          {...form.getInputProps("accountId")}
        />
        <DatePickerInput
          label="Data"
          valueFormat="DD/MM/YYYY"
          key={form.key("date")}
          {...form.getInputProps("date")}
        />
        <Select
          label="Categoria"
          description={`Vazia herda ${inheritedLabel}`}
          placeholder="Herdar a de origem"
          data={categories}
          clearable
          searchable
          key={form.key("categoryId")}
          {...form.getInputProps("categoryId")}
        />
        <TextInput
          label="Descrição"
          description="Opcional"
          placeholder="Herdar a da dívida"
          key={form.key("description")}
          {...form.getInputProps("description")}
        />
        {showManualFx && (
          <>
            <Alert color="yellow" icon={<TriangleAlert size={16} />} title="Taxa de câmbio manual">
              <Text size="sm">
                O serviço de câmbio está indisponível. Informe a cotação de cada conversão: o
                valor abate a dívida em {currency} e move a conta em {accountCurrency}.
              </Text>
            </Alert>
            {needsAccountRate && (
              <NumberInput
                label={`Taxa de ${settlementCurrency} para ${accountCurrency}`}
                description="Usada para debitar ou creditar a conta"
                decimalScale={4}
                min={0}
                key={form.key("manualFxRate")}
                {...form.getInputProps("manualFxRate")}
              />
            )}
            {needsDebtRate && (
              <NumberInput
                label={`Taxa de ${settlementCurrency} para ${currency}`}
                description="Usada para abater o restante da dívida"
                decimalScale={4}
                min={0}
                key={form.key("manualDebtFxRate")}
                {...form.getInputProps("manualDebtFxRate")}
              />
            )}
          </>
        )}
      </FormModal>
    </>
  );
}
