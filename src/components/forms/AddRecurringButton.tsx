"use client";

import { Button, NumberInput, Select, Switch, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { recurringExpenseSchema } from "@/lib/validations";
import { createRecurringExpense } from "@/actions/recurring";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

interface Option {
  value: string;
  label: string;
}

interface AddRecurringButtonProps {
  categories: Option[];
}

export function AddRecurringButton(props: AddRecurringButtonProps) {
  const { categories } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Despesa recorrente adicionada",
  });

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name: "",
      amount: 0,
      currency: "BRL",
      interval: "MONTHLY",
      active: true,
      categoryId: "",
    },
    validate: zod4Resolver(recurringExpenseSchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => createRecurringExpense(values), {
      onSuccess: () => form.reset(),
    });
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Adicionar recorrente
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Adicionar despesa recorrente"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <TextInput
          label="Nome"
          key={form.key("name")}
          {...form.getInputProps("name")}
        />
        <NumberInput
          label="Valor"
          decimalScale={2}
          min={0}
          key={form.key("amount")}
          {...form.getInputProps("amount")}
        />
        <TextInput
          label="Moeda"
          placeholder="BRL"
          key={form.key("currency")}
          {...form.getInputProps("currency")}
        />
        <Select
          label="Intervalo"
          data={[
            { value: "WEEKLY", label: "Semanal" },
            { value: "MONTHLY", label: "Mensal" },
            { value: "YEARLY", label: "Anual" },
          ]}
          key={form.key("interval")}
          {...form.getInputProps("interval")}
        />
        <Select
          label="Categoria"
          placeholder="Opcional"
          clearable
          data={categories}
          key={form.key("categoryId")}
          {...form.getInputProps("categoryId")}
        />
        <Switch
          label="Ativa"
          key={form.key("active")}
          {...form.getInputProps("active", { type: "checkbox" })}
        />
      </FormModal>
    </>
  );
}
