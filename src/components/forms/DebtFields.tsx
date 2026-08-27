"use client";

import { Alert, Group, NumberInput, Select, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import type { UseFormReturnType } from "@mantine/form";
import { TriangleAlert } from "lucide-react";

import { CURRENCY_LABELS, CURRENCY_OPTIONS, type CurrencyCode } from "@/lib/currency";
import { DEBT_TYPE_LABELS, DEBT_TYPE_OPTIONS, type DebtTypeCode } from "@/lib/debtTypes";
import { useFormValue } from "@/components/ui/useFormValue";
import type { AccountOption, Option } from "@/lib/options";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
export type DebtFormValues = {
  personId: string;
  categoryId: string;
  type: string;
  description: string;
  amount: number;
  currency: string;
  accountId: string;
  date: string;
  dueDate: string;
  manualFxRate?: number | undefined;
};

interface DebtFieldsProps {
  form: UseFormReturnType<DebtFormValues>;
  people: Option[];
  categories: Option[];
  accounts: AccountOption[];
  /**
   * Definidos ao editar: tipo e moeda passam a ser exibidos como imutáveis.
   * Trocar o tipo inverteria o sinal de todas as movimentações já lançadas, e
   * trocar a moeda reinterpretaria os valores sem converter nada.
   */
  locked?: { type: DebtTypeCode; currency: CurrencyCode };
  showManualFx: boolean;
}

export function DebtFields(props: DebtFieldsProps) {
  const { form, people, categories, accounts, locked, showManualFx } = props;

  const accountId = useFormValue(form, "accountId");
  const currency = useFormValue(form, "currency");
  const type = useFormValue(form, "type");

  const accountCurrency = accounts.find((account) => account.value === accountId)?.currency;
  const needsConversion = accountCurrency !== undefined && currency !== accountCurrency;
  const isLent = type === "LENT";

  return (
    <>
      {locked ? (
        <TextInput
          label="Tipo"
          description="O tipo de uma dívida existente não pode ser alterado"
          value={DEBT_TYPE_LABELS[locked.type]}
          disabled
        />
      ) : (
        <Select
          label="Tipo"
          description="Define para que lado o dinheiro se move"
          data={DEBT_TYPE_OPTIONS}
          allowDeselect={false}
          key={form.key("type")}
          {...form.getInputProps("type")}
        />
      )}
      <Select
        label="Pessoa"
        data={people}
        allowDeselect={false}
        searchable
        key={form.key("personId")}
        {...form.getInputProps("personId")}
      />
      <TextInput
        label="Descrição"
        placeholder="Passagens da viagem de grupo"
        key={form.key("description")}
        {...form.getInputProps("description")}
      />
      <Select
        label="Categoria de origem"
        description="Obrigatória: é o motivo do empréstimo, e o que aparece nos relatórios"
        data={categories}
        allowDeselect={false}
        searchable
        key={form.key("categoryId")}
        {...form.getInputProps("categoryId")}
      />
      <Group grow align="flex-start">
        <NumberInput
          label="Valor"
          decimalScale={2}
          min={0}
          thousandSeparator="."
          decimalSeparator=","
          key={form.key("amount")}
          {...form.getInputProps("amount")}
        />
        {locked ? (
          <TextInput
            label="Moeda"
            description="Imutável"
            value={CURRENCY_LABELS[locked.currency]}
            disabled
          />
        ) : (
          <Select
            label="Moeda da dívida"
            data={CURRENCY_OPTIONS}
            allowDeselect={false}
            key={form.key("currency")}
            {...form.getInputProps("currency")}
          />
        )}
      </Group>
      <Select
        label={isLent ? "Conta de onde o dinheiro saiu" : "Conta em que o dinheiro entrou"}
        description={
          needsConversion
            ? `A dívida está em ${currency} e o saldo se move em ${accountCurrency}`
            : undefined
        }
        data={accounts}
        allowDeselect={false}
        key={form.key("accountId")}
        {...form.getInputProps("accountId")}
      />
      <Group grow align="flex-start">
        <DatePickerInput
          label="Data"
          valueFormat="DD/MM/YYYY"
          key={form.key("date")}
          {...form.getInputProps("date")}
        />
        <DatePickerInput
          label="Vencimento"
          description="Opcional"
          placeholder="Sem prazo"
          valueFormat="DD/MM/YYYY"
          clearable
          key={form.key("dueDate")}
          {...form.getInputProps("dueDate")}
        />
      </Group>
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
    </>
  );
}
