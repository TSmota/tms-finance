"use client";

import { Group, NumberInput, Select, TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";

import { CURRENCY_LABELS, CURRENCY_OPTIONS, type CurrencyCode } from "@/lib/currency";
import type { Option } from "./options";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
export type CreditCardFormValues = {
  name: string;
  institution: string;
  closingDay: number;
  dueDay: number;
  currency: string;
  creditLimit: number | null;
  defaultPaymentAccountId: string;
};

interface CreditCardFieldsProps {
  form: UseFormReturnType<CreditCardFormValues>;
  accounts: Option[];
  /** Definida ao editar: a moeda passa a ser exibida como imutável. */
  lockedCurrency?: CurrencyCode;
}

export function CreditCardFields(props: CreditCardFieldsProps) {
  const { form, accounts, lockedCurrency } = props;

  return (
    <>
      <TextInput
        label="Nome"
        placeholder="Cartão de crédito"
        key={form.key("name")}
        {...form.getInputProps("name")}
      />
      <TextInput
        label="Banco / instituição"
        description="Opcional. Agrupa este cartão com a conta da mesma origem."
        placeholder="Nubank"
        key={form.key("institution")}
        {...form.getInputProps("institution")}
      />
      <Group grow align="flex-start">
        <NumberInput
          label="Dia de fechamento"
          description="Compras após este dia entram na fatura seguinte"
          min={1}
          max={31}
          allowDecimal={false}
          key={form.key("closingDay")}
          {...form.getInputProps("closingDay")}
        />
        <NumberInput
          label="Dia de vencimento"
          description="Se for menor que o fechamento, vence no mês seguinte"
          min={1}
          max={31}
          allowDecimal={false}
          key={form.key("dueDay")}
          {...form.getInputProps("dueDay")}
        />
      </Group>
      {lockedCurrency ? (
        <TextInput
          label="Moeda"
          description="A moeda de um cartão existente não pode ser alterada"
          value={CURRENCY_LABELS[lockedCurrency]}
          disabled
        />
      ) : (
        <Select
          label="Moeda"
          description="Não pode ser alterada depois: reinterpretaria as faturas emitidas"
          data={CURRENCY_OPTIONS}
          allowDeselect={false}
          key={form.key("currency")}
          {...form.getInputProps("currency")}
        />
      )}
      <NumberInput
        label="Limite de crédito"
        description="Opcional. Informe para acompanhar o limite disponível."
        decimalScale={2}
        min={0}
        thousandSeparator="."
        decimalSeparator=","
        key={form.key("creditLimit")}
        {...form.getInputProps("creditLimit")}
      />
      <Select
        label="Conta de pagamento padrão"
        description="Opcional. Sugerida ao pagar a fatura."
        placeholder="Nenhuma"
        data={accounts}
        clearable
        searchable
        key={form.key("defaultPaymentAccountId")}
        {...form.getInputProps("defaultPaymentAccountId")}
      />
    </>
  );
}
