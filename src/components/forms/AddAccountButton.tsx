"use client";

import { Button, NumberInput, Select, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { accountSchema } from "@/lib/validations";
import { ACCOUNT_TYPES } from "@/lib/accountTypes";
import { CURRENCY_OPTIONS, type CurrencyCode } from "@/lib/currency";
import { createAccount } from "@/actions/accounts";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

interface AddAccountButtonProps {
  /** Último recurso do campo de moeda: a moeda base do usuário. */
  baseCurrency: CurrencyCode;
}

export function AddAccountButton(props: AddAccountButtonProps) {
  const { baseCurrency } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Conta criada",
  });

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name: "",
      type: "CHECKING",
      institution: "",
      currency: baseCurrency,
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
          placeholder="Conta corrente"
          key={form.key("name")}
          {...form.getInputProps("name")}
        />
        <Select
          label="Tipo"
          data={ACCOUNT_TYPES}
          allowDeselect={false}
          key={form.key("type")}
          {...form.getInputProps("type")}
        />
        <TextInput
          label="Banco / instituição"
          description="Opcional. Agrupa esta conta com o cartão da mesma origem."
          placeholder="Nubank"
          key={form.key("institution")}
          {...form.getInputProps("institution")}
        />
        <Select
          label="Moeda"
          description="Não pode ser alterada depois: reinterpretaria todo o histórico"
          data={CURRENCY_OPTIONS}
          allowDeselect={false}
          key={form.key("currency")}
          {...form.getInputProps("currency")}
        />
        <NumberInput
          label="Saldo inicial"
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
