"use client";

import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil } from "lucide-react";

import { creditCardSchema } from "@/lib/validations";
import type { CurrencyCode } from "@/lib/currency";
import { updateCreditCard } from "@/actions/creditCards";
import { FormModal } from "@/components/ui/FormModal";
import { IconButton } from "@/components/ui/IconButton";
import { useActionModal } from "@/components/ui/useActionModal";
import { CreditCardFields, type CreditCardFormValues } from "./CreditCardFields";
import type { Option } from "@/lib/options";

interface EditCreditCardButtonProps {
  id: string;
  values: CreditCardFormValues;
  currency: CurrencyCode;
  accounts: Option[];
}

export function EditCreditCardButton(props: EditCreditCardButtonProps) {
  const { id, values, currency, accounts } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Cartão atualizado",
  });

  const form = useForm<CreditCardFormValues>({
    mode: "uncontrolled",
    initialValues: values,
    validate: zod4Resolver(creditCardSchema),
  });

  const handleOpen = () => {
    form.setValues(values);
    open();
  };

  const handleSubmit = form.onSubmit(async (submitted) => {
    await run(() => updateCreditCard(id, submitted));
  });

  return (
    <>
      <IconButton label="Editar cartão" onClick={handleOpen}>
        <Pencil size={16} />
      </IconButton>
      <FormModal
        opened={opened}
        onClose={close}
        title="Editar cartão"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <CreditCardFields form={form} accounts={accounts} lockedCurrency={currency} />
      </FormModal>
    </>
  );
}
