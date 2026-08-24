"use client";

import { useState } from "react";
import { ActionIcon } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil } from "lucide-react";

import { transactionSchema } from "@/lib/validations";
import { updateTransaction } from "@/actions/transactions";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import { TransactionFields, type TransactionFormValues } from "./TransactionFields";
import type { AccountOption, Option } from "./options";

interface EditTransactionButtonProps {
  id: string;
  values: TransactionFormValues;
  accounts: AccountOption[];
  categories: Option[];
}

export function EditTransactionButton(props: EditTransactionButtonProps) {
  const { id, values, accounts, categories } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Transação atualizada",
  });
  const [showManualFx, setShowManualFx] = useState(false);

  const form = useForm<TransactionFormValues>({
    mode: "uncontrolled",
    initialValues: values,
    validate: zod4Resolver(transactionSchema),
  });

  const handleOpen = () => {
    // Recarrega dos props: a linha pode ter mudado desde a montagem.
    form.setValues(values);
    setShowManualFx(false);
    open();
  };

  const handleSubmit = form.onSubmit(async (submitted) => {
    await run(() => updateTransaction(id, submitted), {
      onError: (result) => {
        if (result.needsManualFxRate) {
          setShowManualFx(true);
        }
      },
    });
  });

  return (
    <>
      <ActionIcon variant="subtle" color="gray" aria-label="Editar transação" onClick={handleOpen}>
        <Pencil size={16} />
      </ActionIcon>
      <FormModal
        opened={opened}
        onClose={close}
        title="Editar transação"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <TransactionFields
          form={form}
          accounts={accounts}
          categories={categories}
          showManualFx={showManualFx}
        />
      </FormModal>
    </>
  );
}
