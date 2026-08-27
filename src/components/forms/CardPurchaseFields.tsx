"use client";

import { Alert, NumberInput, Select, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import type { UseFormReturnType } from "@mantine/form";
import { TriangleAlert } from "lucide-react";

import { CURRENCY_OPTIONS, formatCurrency } from "@/lib/currency";
import { monthName, parseCalendarDate } from "@/lib/dates";
import { describeSplit } from "@/lib/installmentSplit";
import { consecutiveCompetencies, invoiceCompetencyFor } from "@/lib/invoiceCycle";
import { MAX_INSTALLMENTS } from "@/lib/limits";
import { useFormValue } from "@/components/ui/useFormValue";
import type { CardOption, Option } from "@/lib/options";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
export type CardPurchaseFormValues = {
  creditCardId: string;
  categoryId: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  installments: number;
  manualFxRate?: number | undefined;
};

interface CardPurchaseFieldsProps {
  form: UseFormReturnType<CardPurchaseFormValues>;
  /** Cartões com a moeda e o dia de fechamento, para sugerir moeda e fatura. */
  cards: CardOption[];
  categories: Option[];
  /** Mostra o campo de taxa manual quando o câmbio automático falhou. */
  showManualFx: boolean;
}

/**
 * Campos de uma compra no cartão, compartilhados entre lançar e editar.
 *
 * O valor pedido é sempre o **total** da compra, não o da parcela: é o que a
 * regra de divisão recebe, e o que o usuário tem em mãos.
 */
export function CardPurchaseFields(props: CardPurchaseFieldsProps) {
  const { form, cards, categories, showManualFx } = props;

  const creditCardId = useFormValue(form, "creditCardId");
  const currency = useFormValue(form, "currency");
  const amount = useFormValue(form, "amount");
  const installments = useFormValue(form, "installments");
  const date = useFormValue(form, "date");

  const card = cards.find((entry) => entry.value === creditCardId);
  const cardCurrency = card?.currency;
  const needsConversion = cardCurrency !== undefined && currency !== cardCurrency;

  // Prévia da divisão pela mesma regra que o servidor aplica.
  const installmentPreview = describeSplit(
    Math.round((amount || 0) * 100),
    installments,
    (cents) => formatCurrency(cents / 100, currency),
  );

  const invoiceHint = describeTargetInvoices(card, date, installments);

  return (
    <>
      <Select
        label="Cartão"
        data={cards}
        allowDeselect={false}
        key={form.key("creditCardId")}
        {...form.getInputProps("creditCardId")}
        onChange={(value) => {
          form.getInputProps("creditCardId").onChange(value);

          const currency = cards.find((card) => card.value === value)?.currency;

          if (currency) {
            form.setFieldValue("currency", currency);
          }
        }}
      />
      <TextInput
        label="Descrição"
        key={form.key("description")}
        {...form.getInputProps("description")}
      />
      <NumberInput
        label="Valor total"
        description="O valor cheio da compra, não o da parcela"
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
          needsConversion ? `Será convertido para ${cardCurrency}, a moeda do cartão` : undefined
        }
        data={CURRENCY_OPTIONS}
        allowDeselect={false}
        key={form.key("currency")}
        {...form.getInputProps("currency")}
      />
      <NumberInput
        label="Parcelas"
        description={installmentPreview ?? "1 para compra à vista"}
        min={1}
        max={MAX_INSTALLMENTS}
        allowDecimal={false}
        key={form.key("installments")}
        {...form.getInputProps("installments")}
      />
      <DatePickerInput
        label="Data da compra"
        description={invoiceHint ?? "Depois do dia de fechamento, entra na fatura seguinte"}
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
      {showManualFx && (
        <>
          <Alert color="yellow" icon={<TriangleAlert size={16} />} title="Taxa de câmbio manual">
            <Text size="sm">
              O serviço de câmbio está indisponível. Informe a taxa de {currency} para{" "}
              {cardCurrency}.
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

/**
 * Em que fatura a compra vai cair, pela mesma função que o servidor usa.
 *
 * Sem a prévia, compra depois do fechamento some da fatura que o usuário
 * esperava e só aparece um mês adiante.
 */
function describeTargetInvoices(
  card: CardOption | undefined,
  date: string,
  installments: number,
): string | null {
  if (!card || !date) {
    return null;
  }

  let purchaseDate: Date;

  try {
    purchaseDate = parseCalendarDate(date);
  } catch {
    return null;
  }

  const count = Number.isInteger(installments) && installments > 0 ? installments : 1;
  const competencies = consecutiveCompetencies(
    invoiceCompetencyFor(card, purchaseDate),
    Math.min(count, MAX_INSTALLMENTS),
  );

  const label = (index: number) => {
    const competency = competencies[index]!;

    return `${monthName(competency.month)}/${competency.year}`;
  };

  return competencies.length === 1
    ? `Entra na fatura de ${label(0)}`
    : `Entra nas faturas de ${label(0)} a ${label(competencies.length - 1)}`;
}
