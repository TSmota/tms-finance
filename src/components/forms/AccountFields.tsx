"use client";

import { NumberInput, Select, TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";

import { ACCOUNT_TYPES } from "@/lib/accountTypes";
import { CURRENCY_LABELS, CURRENCY_OPTIONS, type CurrencyCode } from "@/lib/currency";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
export type AccountFormValues = {
  name: string;
  type: string;
  institution: string;
  currency: string;
  initialBalance: number;
};

interface AccountFieldsProps {
  form: UseFormReturnType<AccountFormValues>;
  /** Definida ao editar: a moeda passa a ser exibida como imutável. */
  lockedCurrency?: CurrencyCode;
}

export function AccountFields(props: AccountFieldsProps) {
  const { form, lockedCurrency } = props;

  return (
    <>
      <TextInput
        label="Nome"
        placeholder="Conta corrente"
        key={form.key("name")}
        {...form.getInputProps("name")}
      />
      <Select
        label="Tipo"
        data={ACCOUNT_TYPES}
        allowDeselect={false}
        key={form.key("type")}
        {...form.getInputProps("type")}
      />
      <TextInput
        label="Banco / instituição"
        description="Opcional. Agrupa esta conta com o cartão da mesma origem."
        placeholder="Nubank"
        key={form.key("institution")}
        {...form.getInputProps("institution")}
      />
      {lockedCurrency ? (
        <TextInput
          label="Moeda"
          description="A moeda de uma conta existente não pode ser alterada"
          value={CURRENCY_LABELS[lockedCurrency]}
          disabled
        />
      ) : (
        <Select
          label="Moeda"
          description="Não pode ser alterada depois: reinterpretaria todo o histórico"
          data={CURRENCY_OPTIONS}
          allowDeselect={false}
          key={form.key("currency")}
          {...form.getInputProps("currency")}
        />
      )}
      <NumberInput
        label="Saldo inicial"
        description={
          lockedCurrency ? "Alterar desloca o saldo atual pela mesma diferença" : undefined
        }
        decimalScale={2}
        thousandSeparator="."
        decimalSeparator=","
        key={form.key("initialBalance")}
        {...form.getInputProps("initialBalance")}
      />
    </>
  );
}
