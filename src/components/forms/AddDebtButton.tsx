"use client";

import { Button, NumberInput, Textarea, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { debtSchema } from "@/lib/validations";
import { createDebt } from "@/actions/debts";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

export function AddDebtButton() {
  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Dívida adicionada",
  });

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      debtorName: "",
      description: "",
      totalAmount: 0,
      currency: "BRL",
      dueDate: null as Date | null,
    },
    validate: zod4Resolver(debtSchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => createDebt(values), { onSuccess: () => form.reset() });
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Adicionar dívida
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Adicionar dívida"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <TextInput
          label="Nome do devedor"
          key={form.key("debtorName")}
          {...form.getInputProps("debtorName")}
        />
        <NumberInput
          label="Valor total"
          decimalScale={2}
          min={0}
          key={form.key("totalAmount")}
          {...form.getInputProps("totalAmount")}
        />
        <TextInput
          label="Moeda"
          placeholder="BRL"
          key={form.key("currency")}
          {...form.getInputProps("currency")}
        />
        <DatePickerInput
          label="Data de vencimento"
          placeholder="Opcional"
          clearable
          key={form.key("dueDate")}
          {...form.getInputProps("dueDate")}
        />
        <Textarea
          label="Descrição"
          placeholder="Opcional"
          key={form.key("description")}
          {...form.getInputProps("description")}
        />
      </FormModal>
    </>
  );
}
