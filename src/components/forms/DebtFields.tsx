"use client";

import { Alert, Group, NumberInput, Select, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import type { FormErrors, UseFormReturnType } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { TriangleAlert } from "lucide-react";

import { debtSchema } from "@/lib/validations";
import { CURRENCY_LABELS, CURRENCY_OPTIONS, formatCurrency, type CurrencyCode } from "@/lib/currency";
import { DEBT_TYPE_LABELS, DEBT_TYPE_OPTIONS, type DebtTypeCode } from "@/lib/debtTypes";
import { describeSplit } from "@/lib/installmentSplit";
import { MAX_INSTALLMENTS } from "@/lib/limits";
import {
  splitTarget,
  TARGET_ACCOUNT_PREFIX,
  TARGET_CARD_PREFIX,
} from "@/lib/paymentTarget";
import { useFormValue } from "@/components/ui/useFormValue";
import type { AccountOption, CardOption, Option } from "@/lib/options";
import { describeTargetInvoices } from "./invoiceHint";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
export type DebtFormValues = {
  personId: string;
  categoryId: string;
  type: string;
  description: string;
  amount: number;
  currency: string;
  /** Origem codificada: exatamente um destino fica preenchido. */
  target: string;
  /** Só no cartão; 1 em conta. */
  installments: number;
  date: string;
  /** `null`, não `""`: vazio do `DatePickerInput` é `null`. */
  dueDate: string | null;
  manualFxRate?: number | undefined;
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
export function validateDebt(values: DebtFormValues): FormErrors {
  const errors = zod4Resolver(debtSchema)({
    ...values,
    ...splitTarget(values.target),
  });

  const targetError = errors.accountId ?? errors.creditCardId;

  if (targetError) {
    errors.target = targetError;
    delete errors.accountId;
    delete errors.creditCardId;
  }

  return errors;
}

interface DebtFieldsProps {
  form: UseFormReturnType<DebtFormValues>;
  people: Option[];
  categories: Option[];
  accounts: AccountOption[];
  cards: CardOption[];
  /**
   * Definidos ao editar: tipo e moeda passam a ser exibidos como imutáveis.
   * Trocar o tipo inverteria o sinal de todas as movimentações já lançadas, e
   * trocar a moeda reinterpretaria os valores sem converter nada.
   */
  locked?: { type: DebtTypeCode; currency: CurrencyCode };
  showManualFx: boolean;
}

export function DebtFields(props: DebtFieldsProps) {
  const { form, people, categories, accounts, cards, locked, showManualFx } = props;

  const target = useFormValue(form, "target") ?? "";
  const currency = useFormValue(form, "currency");
  const type = useFormValue(form, "type");
  const amount = useFormValue(form, "amount");
  const installments = useFormValue(form, "installments") ?? 1;
  const date = useFormValue(form, "date");

  const isLent = type === "LENT";
  const { accountId, creditCardId } = splitTarget(target);
  const card = cards.find((entry) => entry.value === creditCardId);
  const destination = card ?? accounts.find((entry) => entry.value === accountId);
  const destinationCurrency = destination?.currency;
  const needsConversion = destinationCurrency !== undefined && currency !== destinationCurrency;

  // Prévia da divisão pela mesma regra que o servidor aplica.
  const installmentPreview = card
    ? describeSplit(Math.round((amount || 0) * 100), installments, (cents) =>
        formatCurrency(cents / 100, currency),
      )
    : null;

  const targetData = [
    {
      group: isLent ? "Contas — o dinheiro sai do saldo" : "Contas — o dinheiro entra no saldo",
      items: accounts.map((account) => ({
        value: `${TARGET_ACCOUNT_PREFIX}${account.value}`,
        label: account.label,
      })),
    },
    ...(isLent
      ? [
          {
            group: "Cartões — entra na fatura, sai quando ela for paga",
            items: cards.map((entry) => ({
              value: `${TARGET_CARD_PREFIX}${entry.value}`,
              label: entry.label,
            })),
          },
        ]
      : []),
  ];

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
          onChange={(value) => {
            form.getInputProps("type").onChange(value);

            if (value === "BORROWED" && target.startsWith(TARGET_CARD_PREFIX)) {
              form.setFieldValue(
                "target",
                accounts[0] ? `${TARGET_ACCOUNT_PREFIX}${accounts[0].value}` : "",
              );
              form.setFieldValue("installments", 1);
            }
          }}
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
          label={card ? "Valor total" : "Valor"}
          description={card ? "O valor cheio, não o da parcela" : undefined}
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
        label={isLent ? "De onde o dinheiro saiu" : "Onde o dinheiro entrou"}
        description={
          needsConversion
            ? `A dívida está em ${currency} e o destino se move em ${destinationCurrency}`
            : "Conta move o saldo na hora; cartão entra na fatura"
        }
        data={targetData}
        allowDeselect={false}
        searchable
        key={form.key("target")}
        {...form.getInputProps("target")}
        onChange={(value) => {
          form.getInputProps("target").onChange(value);

          if (value && !value.startsWith(TARGET_CARD_PREFIX)) {
            form.setFieldValue("installments", 1);
          }
        }}
      />
      {card && (
        <NumberInput
          label="Parcelas"
          description={
            installmentPreview ??
            `Divide a origem em faturas consecutivas (até ${MAX_INSTALLMENTS})`
          }
          min={1}
          max={MAX_INSTALLMENTS}
          allowDecimal={false}
          key={form.key("installments")}
          {...form.getInputProps("installments")}
        />
      )}
      {card && date && (
        <Text size="sm" c="dimmed">
          {describeTargetInvoices(card, date, installments)}
        </Text>
      )}
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
              {destinationCurrency}.
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
