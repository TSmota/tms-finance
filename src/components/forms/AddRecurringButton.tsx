"use client";

import { useState } from "react";
import {
  Button,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Plus } from "lucide-react";

import { recurringExpenseSchema } from "@/lib/validations";
import { createRecurringExpense } from "@/actions/recurring";

interface Option {
  value: string;
  label: string;
}

interface AddRecurringButtonProps {
  categories: Option[];
}

export function AddRecurringButton(props: AddRecurringButtonProps) {
  const { categories } = props;

  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    const res = await createRecurringExpense(values);
    setLoading(false);
    if (!res.ok) {
      notifications.show({ color: "red", message: res.error ?? "Falha ao salvar" });
      return;
    }
    notifications.show({ color: "teal", message: "Despesa recorrente adicionada" });
    form.reset();
    close();
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Adicionar recorrente
      </Button>
      <Modal opened={opened} onClose={close} title="Adicionar despesa recorrente" centered>
        <form onSubmit={handleSubmit}>
          <Stack>
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
            <Button type="submit" loading={loading}>
              Salvar
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
