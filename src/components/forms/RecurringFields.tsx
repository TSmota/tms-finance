"use client";

import { Group, NumberInput, Select, Switch, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import type { FormErrors, UseFormReturnType } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";

import { recurringExpenseSchema } from "@/lib/validations";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import {
  splitTarget,
  TARGET_ACCOUNT_PREFIX,
  TARGET_CARD_PREFIX,
} from "@/lib/recurringTarget";
import { FREQUENCY_OPTIONS } from "@/lib/recurrence";
import type { AccountOption, Option } from "./options";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
export type RecurringFormValues = {
  description: string;
  amount: number;
  currency: string;
  frequency: string;
  dueDay: number;
  isEstimated: boolean;
  startDate: string;
  endDate: string;
  categoryId: string;
  /** Destino: exatamente um dos dois fica preenchido. */
  target: string;
};

/**
 * Valida o formulário contra o schema do serviço.
 *
 * Não dá para passar `zod4Resolver` direto em `validate`: o `transformValues` do
 * Mantine só é aplicado no `onSubmit`, então a validação veria `target` — que o
 * schema não conhece — e nunca `accountId`/`creditCardId`, fazendo o XOR falhar
 * em toda submissão. Aqui a conversão acontece antes, e o erro de destino é
 * remapeado para o campo que existe na tela.
 */
export function validateRecurring(values: RecurringFormValues): FormErrors {
  const errors = zod4Resolver(recurringExpenseSchema)({
    ...values,
    ...splitTarget(values.target),
  });

  if (errors.accountId) {
    errors.target = errors.accountId;
    delete errors.accountId;
  }

  return errors;
}

interface RecurringFieldsProps {
  form: UseFormReturnType<RecurringFormValues>;
  accounts: AccountOption[];
  cards: AccountOption[];
  categories: Option[];
}

export function RecurringFields(props: RecurringFieldsProps) {
  const { form, accounts, cards, categories } = props;

  const targetData = [
    {
      group: "Contas — gera pendência no fluxo de caixa",
      items: accounts.map((account) => ({
        value: `${TARGET_ACCOUNT_PREFIX}${account.value}`,
        label: account.label,
      })),
    },
    {
      group: "Cartões — gera lançamento na fatura",
      items: cards.map((card) => ({
        value: `${TARGET_CARD_PREFIX}${card.value}`,
        label: card.label,
      })),
    },
  ];

  const values = form.getValues();
  const isWeekly = values.frequency === "WEEKLY";

  return (
    <>
      <TextInput
        label="Descrição"
        placeholder="Netflix"
        key={form.key("description")}
        {...form.getInputProps("description")}
      />
      <Select
        label="Pago com"
        description="Conta gera uma pendência a confirmar; cartão vai direto para a fatura"
        data={targetData}
        allowDeselect={false}
        searchable
        key={form.key("target")}
        {...form.getInputProps("target")}
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
        <Select
          label="Moeda"
          data={CURRENCY_OPTIONS}
          allowDeselect={false}
          key={form.key("currency")}
          {...form.getInputProps("currency")}
        />
      </Group>
      <Group grow align="flex-start">
        <Select
          label="Periodicidade"
          data={FREQUENCY_OPTIONS}
          allowDeselect={false}
          key={form.key("frequency")}
          {...form.getInputProps("frequency")}
        />
        <NumberInput
          label="Dia do vencimento"
          description={
            isWeekly
              ? "Ignorado: a recorrência semanal segue o dia da semana do início"
              : "Dias que não existem no mês caem no último dia"
          }
          min={1}
          max={31}
          allowDecimal={false}
          disabled={isWeekly}
          key={form.key("dueDay")}
          {...form.getInputProps("dueDay")}
        />
      </Group>
      <Group grow align="flex-start">
        <DatePickerInput
          label="Início"
          valueFormat="DD/MM/YYYY"
          key={form.key("startDate")}
          {...form.getInputProps("startDate")}
        />
        <DatePickerInput
          label="Fim"
          description="Opcional"
          placeholder="Sem fim"
          valueFormat="DD/MM/YYYY"
          clearable
          key={form.key("endDate")}
          {...form.getInputProps("endDate")}
        />
      </Group>
      <Select
        label="Categoria"
        description="Herdada pelos lançamentos gerados"
        data={categories}
        allowDeselect={false}
        searchable
        key={form.key("categoryId")}
        {...form.getInputProps("categoryId")}
      />
      <Switch
        label="Valor estimado"
        description="Marque para contas de valor variável, a conferir no vencimento"
        key={form.key("isEstimated")}
        {...form.getInputProps("isEstimated", { type: "checkbox" })}
      />
    </>
  );
}
