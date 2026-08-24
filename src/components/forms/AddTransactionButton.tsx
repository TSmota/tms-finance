"use client";

import { useState } from "react";
import { Button } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { transactionSchema } from "@/lib/validations";
import type { CurrencyCode } from "@/lib/currency";
import { todayCalendarDate } from "@/lib/dates";
import { createTransaction } from "@/actions/transactions";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import { TransactionFields, type TransactionFormValues } from "./TransactionFields";
import type { AccountOption, Option } from "./options";

interface AddTransactionButtonProps {
  accounts: AccountOption[];
  categories: Option[];
  /** Último recurso do campo de moeda: a moeda base do usuário. */
  baseCurrency: CurrencyCode;
}

export function AddTransactionButton(props: AddTransactionButtonProps) {
  const { accounts, categories, baseCurrency } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Transação adicionada",
  });
  const [showManualFx, setShowManualFx] = useState(false);

  const initialValues: TransactionFormValues = {
    accountId: accounts[0]?.value ?? "",
    categoryId: "",
    type: "EXPENSE",
    amount: 0,
    currency: accounts[0]?.currency ?? baseCurrency,
    date: todayCalendarDate(),
    description: "",
    manualFxRate: undefined,
  };

  const form = useForm<TransactionFormValues>({
    mode: "uncontrolled",
    initialValues,
    validate: zod4Resolver(transactionSchema),
  });

  const handleOpen = () => {
    form.setValues(initialValues);
    setShowManualFx(false);
    open();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => createTransaction(values), {
      onSuccess: () => {
        form.setValues(initialValues);
        setShowManualFx(false);
      },
      onError: (result) => {
        if (result.needsManualFxRate) {
          setShowManualFx(true);
        }
      },
    });
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={handleOpen}>
        Adicionar transação
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Adicionar transação"
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
