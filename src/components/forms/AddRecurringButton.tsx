"use client";

import { Button } from "@mantine/core";
import { useForm } from "@mantine/form";
import { Plus } from "lucide-react";

import { todayCalendarDate } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/currency";
import { createRecurringExpense } from "@/actions/recurring";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import { splitTarget } from "@/lib/recurringTarget";
import {
  RecurringFields,
  validateRecurring,
  type RecurringFormValues,
} from "./RecurringFields";
import type { AccountOption, Option } from "./options";

interface AddRecurringButtonProps {
  accounts: AccountOption[];
  cards: AccountOption[];
  categories: Option[];
  /** Último recurso do campo de moeda: a moeda base do usuário. */
  baseCurrency: CurrencyCode;
}

export function AddRecurringButton(props: AddRecurringButtonProps) {
  const { accounts, cards, categories, baseCurrency } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Recorrência criada",
  });

  const today = todayCalendarDate();

  const initialValues: RecurringFormValues = {
    description: "",
    amount: 0,
    currency: accounts[0]?.currency ?? cards[0]?.currency ?? baseCurrency,
    frequency: "MONTHLY",
    // O dia de hoje é o palpite mais provável para quem está cadastrando agora.
    dueDay: Number(today.slice(8, 10)),
    isEstimated: false,
    startDate: today,
    endDate: "",
    categoryId: categories[0]?.value ?? "",
    target: "",
  };

  const form = useForm<RecurringFormValues>({
    mode: "uncontrolled",
    initialValues,
    validate: validateRecurring,
    transformValues: (values) => ({ ...values, ...splitTarget(values.target) }),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => createRecurringExpense(values), {
      onSuccess: () => form.setValues(initialValues),
    });
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Nova recorrência
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Nova recorrência"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <RecurringFields
          form={form}
          accounts={accounts}
          cards={cards}
          categories={categories}
        />
      </FormModal>
    </>
  );
}
