"use client";

import { ActionIcon, NumberInput, Select, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil } from "lucide-react";
import type { AccountType } from "@prisma/client";

import { updateAccount } from "@/actions/accounts";
import { accountSchema } from "@/lib/validations";
import { ACCOUNT_TYPES } from "@/lib/accountTypes";
import { CURRENCY_LABELS, type CurrencyCode } from "@/lib/currency";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

interface EditAccountButtonProps {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: CurrencyCode;
  initialBalance: number;
}

export function EditAccountButton(props: EditAccountButtonProps) {
  const { id, name, type, institution, currency, initialBalance } = props;

  const values = { name, type, institution: institution ?? "", currency, initialBalance };

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Conta atualizada",
  });

  const form = useForm({
    mode: "uncontrolled",
    initialValues: values,
    validate: zod4Resolver(accountSchema),
  });

  const handleOpen = () => {
    form.setValues(values);
    open();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => updateAccount(id, values));
  });

  return (
    <>
      <ActionIcon variant="subtle" color="gray" aria-label="Editar conta" onClick={handleOpen}>
        <Pencil size={16} />
      </ActionIcon>
      <FormModal
        opened={opened}
        onClose={close}
        title="Editar conta"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <TextInput label="Nome" key={form.key("name")} {...form.getInputProps("name")} />
        <Select
          label="Tipo"
          data={ACCOUNT_TYPES}
          allowDeselect={false}
          key={form.key("type")}
          {...form.getInputProps("type")}
        />
        <TextInput
          label="Banco / instituição"
          placeholder="Opcional"
          key={form.key("institution")}
          {...form.getInputProps("institution")}
        />
        <TextInput
          label="Moeda"
          description="A moeda de uma conta existente não pode ser alterada"
          value={CURRENCY_LABELS[currency]}
          disabled
        />
        <NumberInput
          label="Saldo inicial"
          description="Alterar desloca o saldo atual pela mesma diferença"
          decimalScale={2}
          thousandSeparator="."
          decimalSeparator=","
          key={form.key("initialBalance")}
          {...form.getInputProps("initialBalance")}
        />
      </FormModal>
    </>
  );
}
