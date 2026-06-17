"use client";

import { useState } from "react";
import {
    ActionIcon,
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
import { Pencil } from "lucide-react";

import { updateAccount } from "@/actions/accounts";
import { ACCOUNT_TYPES } from "@/lib/accountTypes";
import { accountSchema } from "@/lib/validations";

interface EditAccountButtonProps {
  id: string;
  name: string;
  type: string;
  currency: string;
  initialBalance: number;
}

export function EditAccountButton(props: EditAccountButtonProps) {
  const { id, name, type, currency, initialBalance } = props;

  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name,
      type,
      currency,
      initialBalance,
    },
    validate: zod4Resolver(accountSchema),
  });

  const handleOpen = () => {
    form.setValues({
      name,
      type,
      currency,
      initialBalance,
    });
    open();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    setLoading(true);
    const result = await updateAccount(id, values);
    setLoading(false);

    if (!result.ok) {
      notifications.show({ color: "red", message: result.error ?? "Falha ao salvar" });
      return;
    }

    notifications.show({ color: "teal", message: "Conta atualizada" });
    close();
  });

  return (
    <>
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label="Editar conta"
        onClick={handleOpen}
      >
        <Pencil size={16} />
      </ActionIcon>
      <Modal opened={opened} onClose={close} title="Editar conta" centered>
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
