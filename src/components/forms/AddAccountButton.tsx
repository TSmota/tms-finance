"use client";

import { Button, NumberInput, Select, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { accountSchema } from "@/lib/validations";
import { ACCOUNT_TYPES } from "@/lib/accountTypes";
import { createAccount } from "@/actions/accounts";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

export function AddAccountButton() {
  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Conta criada",
  });

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
    await run(() => createAccount(values), { onSuccess: () => form.reset() });
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Adicionar conta
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Adicionar conta"
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
