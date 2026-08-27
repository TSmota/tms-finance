"use client";

import { Button } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { accountSchema } from "@/lib/validations";
import type { CurrencyCode } from "@/lib/currency";
import { createAccount } from "@/actions/accounts";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import { AccountFields, type AccountFormValues } from "./AccountFields";

interface AddAccountButtonProps {
  /** Último recurso do campo de moeda: a moeda base do usuário. */
  baseCurrency: CurrencyCode;
}

export function AddAccountButton(props: AddAccountButtonProps) {
  const { baseCurrency } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Conta criada",
  });

  const initialValues: AccountFormValues = {
    name: "",
    type: "CHECKING",
    institution: "",
    currency: baseCurrency,
    initialBalance: 0,
  };

  const form = useForm({
    mode: "uncontrolled",
    initialValues,
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
        <AccountFields form={form} />
      </FormModal>
    </>
  );
}
