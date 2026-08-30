"use client";

import { useForm } from "@mantine/form";
import { Pencil } from "lucide-react";

import { updateRecurringExpense } from "@/actions/recurring";
import { FormModal } from "@/components/ui/FormModal";
import { IconButton } from "@/components/ui/IconButton";
import { useActionModal } from "@/components/ui/useActionModal";
import { splitTarget } from "@/lib/paymentTarget";
import {
  RecurringFields,
  validateRecurring,
  type RecurringFormValues,
} from "./RecurringFields";
import type { AccountOption, Option } from "@/lib/options";

interface EditRecurringButtonProps {
  id: string;
  values: RecurringFormValues;
  accounts: AccountOption[];
  cards: AccountOption[];
  categories: Option[];
}

export function EditRecurringButton(props: EditRecurringButtonProps) {
  const { id, values, accounts, cards, categories } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Recorrência atualizada",
  });

  const form = useForm<RecurringFormValues>({
    mode: "uncontrolled",
    initialValues: values,
    validate: validateRecurring,
    transformValues: (submitted) => ({ ...submitted, ...splitTarget(submitted.target) }),
  });

  const handleOpen = () => {
    form.setValues(values);
    open();
  };

  const handleSubmit = form.onSubmit(async (submitted) => {
    await run(() => updateRecurringExpense(id, submitted));
  });

  return (
    <>
      <IconButton label="Editar recorrência" onClick={handleOpen}>
        <Pencil size={16} />
      </IconButton>
      <FormModal
        opened={opened}
        onClose={close}
        title="Editar recorrência"
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
