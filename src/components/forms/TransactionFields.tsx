"use client";

import { Alert, NumberInput, Select, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import type { UseFormReturnType } from "@mantine/form";
import { TriangleAlert } from "lucide-react";

import { CURRENCY_OPTIONS } from "@/lib/currency";
import type { AccountOption, Option } from "./options";

/**
 * `type`, não `interface`: o TypeScript concede index signature implícita a
 * type aliases, e sem ela o tipo não é atribuível ao `Record<string, unknown>`
 * que o `zod4Resolver` espera.
 */
export type TransactionFormValues = {
  accountId: string;
  categoryId: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  currency: string;
  /** Data-calendário `YYYY-MM-DD`, o formato nativo do DatePickerInput. */
  date: string;
  description: string;
  manualFxRate?: number | undefined;
};

interface TransactionFieldsProps {
  form: UseFormReturnType<TransactionFormValues>;
  accounts: AccountOption[];
  categories: Option[];
  /** Mostra o campo de taxa manual quando o câmbio automático falhou. */
  showManualFx: boolean;
}

/**
 * Campos compartilhados pelos formulários de criar e editar transação.
 *
 * Extraído porque os dois têm os mesmos campos e a mesma regra de moeda;
 * duplicá-los faria as telas divergirem na primeira alteração.
 */
export function TransactionFields(props: TransactionFieldsProps) {
  const { form, accounts, categories, showManualFx } = props;

  const accountId = form.getValues().accountId;
  const accountCurrency = accounts.find((account) => account.value === accountId)?.currency;
  const transactionCurrency = form.getValues().currency;
  const needsConversion =
    accountCurrency !== undefined && transactionCurrency !== accountCurrency;

  return (
    <>
      <Select
        label="Conta"
        data={accounts}
        allowDeselect={false}
        key={form.key("accountId")}
        {...form.getInputProps("accountId")}
        onChange={(value) => {
          form.getInputProps("accountId").onChange(value);

          // Ao trocar de conta, sugere a moeda nativa dela — o caso comum.
          const currency = accounts.find((account) => account.value === value)?.currency;

          if (currency) {
            form.setFieldValue("currency", currency);
          }
        }}
      />
      <Select
        label="Tipo"
        data={[
          { value: "EXPENSE", label: "Despesa" },
          { value: "INCOME", label: "Receita" },
        ]}
        allowDeselect={false}
        key={form.key("type")}
        {...form.getInputProps("type")}
      />
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
        label="Moeda do lançamento"
        description={
          needsConversion
            ? `Será convertido para ${accountCurrency}, a moeda da conta`
            : undefined
        }
        data={CURRENCY_OPTIONS}
        allowDeselect={false}
        key={form.key("currency")}
        {...form.getInputProps("currency")}
      />
      <DatePickerInput
        label="Data"
        valueFormat="DD/MM/YYYY"
        key={form.key("date")}
        {...form.getInputProps("date")}
      />
      <Select
        label="Categoria"
        placeholder="Opcional"
        clearable
        searchable
        data={categories}
        key={form.key("categoryId")}
        {...form.getInputProps("categoryId")}
      />
      <TextInput
        label="Descrição"
        key={form.key("description")}
        {...form.getInputProps("description")}
      />
      {showManualFx && (
        <>
          <Alert color="yellow" icon={<TriangleAlert size={16} />} title="Taxa de câmbio manual">
            O serviço de câmbio está indisponível. Informe a taxa de{" "}
            {transactionCurrency} para {accountCurrency}.
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
    </>
  );
}
