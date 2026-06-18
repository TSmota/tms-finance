"use client";

import { ActionIcon, NumberInput, Select, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil } from "lucide-react";

import { updateAccount } from "@/actions/accounts";
import { ACCOUNT_TYPES } from "@/lib/accountTypes";
import { accountSchema } from "@/lib/validations";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

interface EditAccountButtonProps {
  id: string;
  name: string;
  type: string;
  currency: string;
  initialBalance: number;
}

export function EditAccountButton(props: EditAccountButtonProps) {
  const { id, name, type, currency, initialBalance } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Conta atualizada",
  });

  const form = useForm({
    mode: "uncontrolled",
    initialValues: { name, type, currency, initialBalance },
    validate: zod4Resolver(accountSchema),
  });

  const handleOpen = () => {
    form.setValues({ name, type, currency, initialBalance });
    open();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => updateAccount(id, values));
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
      <FormModal
        opened={opened}
        onClose={close}
        title="Editar conta"
        onSubmit={handleSubmit}
        loading={loading}
      >
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
      </FormModal>
    </>
  );
}
