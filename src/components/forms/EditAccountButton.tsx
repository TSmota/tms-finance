"use client";

import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil } from "lucide-react";
import type { AccountType } from "@prisma/client";

import { updateAccount } from "@/actions/accounts";
import { accountSchema } from "@/lib/validations";
import type { CurrencyCode } from "@/lib/currency";
import { FormModal } from "@/components/ui/FormModal";
import { IconButton } from "@/components/ui/IconButton";
import { useActionModal } from "@/components/ui/useActionModal";
import { AccountFields, type AccountFormValues } from "./AccountFields";

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

  const values: AccountFormValues = {
    name,
    type,
    institution: institution ?? "",
    currency,
    initialBalance,
  };

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
      <IconButton label="Editar conta" onClick={handleOpen}>
        <Pencil size={16} />
      </IconButton>
      <FormModal
        opened={opened}
        onClose={close}
        title="Editar conta"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <AccountFields form={form} lockedCurrency={currency} />
      </FormModal>
    </>
  );
}
