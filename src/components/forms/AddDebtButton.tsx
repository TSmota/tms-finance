"use client";

import { useState } from "react";
import {
  Button,
  Modal,
  NumberInput,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Plus } from "lucide-react";

import { debtSchema } from "@/lib/validations";
import { createDebt } from "@/actions/debts";

export function AddDebtButton() {
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    const res = await createDebt(values);
    setLoading(false);
    if (!res.ok) {
      notifications.show({ color: "red", message: res.error ?? "Falha ao salvar" });
      return;
    }
    notifications.show({ color: "teal", message: "Dívida adicionada" });
    form.reset();
    close();
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Adicionar dívida
      </Button>
      <Modal opened={opened} onClose={close} title="Adicionar dívida" centered>
        <form onSubmit={handleSubmit}>
          <Stack>
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
            <Button type="submit" loading={loading}>
              Salvar
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
