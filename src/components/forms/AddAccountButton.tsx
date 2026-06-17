"use client";

import { useState } from "react";
import {
  Button,
  Modal,
  NumberInput,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Plus } from "lucide-react";

import { accountSchema } from "@/lib/validations";
import { ACCOUNT_TYPES } from "@/lib/accountTypes";
import { createAccount } from "@/actions/accounts";

export function AddAccountButton() {
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name: "",
      type: "CHECKING",
      currency: "BRL",
      initialBalance: 0,
    },
    validate: zod4Resolver(accountSchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setLoading(true);
    const res = await createAccount(values);
    setLoading(false);
    if (!res.ok) {
      notifications.show({ color: "red", message: res.error ?? "Falha ao salvar" });
      return;
    }
    notifications.show({ color: "teal", message: "Conta criada" });
    form.reset();
    close();
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Adicionar conta
      </Button>
      <Modal opened={opened} onClose={close} title="Adicionar conta" centered>
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput
              label="Nome"
              key={form.key("name")}
              {...form.getInputProps("name")}
            />
            <Select
              label="Tipo"
              data={ACCOUNT_TYPES}
              key={form.key("type")}
              {...form.getInputProps("type")}
            />
            <TextInput
              label="Moeda"
              placeholder="BRL"
              key={form.key("currency")}
              {...form.getInputProps("currency")}
            />
            <NumberInput
              label="Saldo inicial"
              decimalScale={2}
              key={form.key("initialBalance")}
              {...form.getInputProps("initialBalance")}
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
