"use client";

import { useState } from "react";
import { ActionIcon, Alert, NumberInput, Select, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil, TriangleAlert } from "lucide-react";

import { transactionSchema } from "@/lib/validations";
import { updateTransaction } from "@/actions/transactions";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

interface Option {
  value: string;
  label: string;
}

interface EditTransactionButtonProps {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: "INFLOW" | "OUTFLOW";
  amount: number;
  date: Date;
  description: string;
  accounts: Option[];
  categories: Option[];
}

export function EditTransactionButton(props: EditTransactionButtonProps) {
  const { id, accountId, categoryId, type, amount, date, description, accounts, categories } =
    props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Transação atualizada",
  });
  const [showManualFx, setShowManualFx] = useState(false);

  const initialValues = {
    accountId,
    categoryId: categoryId ?? "",
    type,
    amount,
    date,
    description,
    manualFxRate: undefined as number | undefined,
  };

  const form = useForm({
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
    await run(() => updateTransaction(id, values), {
      onError: (res) => {
        if (res.needsManualFxRate) setShowManualFx(true);
      },
    });
  });

  return (
    <>
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label="Editar transação"
        onClick={handleOpen}
      >
        <Pencil size={16} />
      </ActionIcon>
      <FormModal
        opened={opened}
        onClose={close}
        title="Editar transação"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <Select
          label="Conta"
          data={accounts}
          key={form.key("accountId")}
          {...form.getInputProps("accountId")}
        />
        <Select
          label="Tipo"
          data={[
            { value: "OUTFLOW", label: "Despesa" },
            { value: "INFLOW", label: "Receita" },
          ]}
          key={form.key("type")}
          {...form.getInputProps("type")}
        />
        <NumberInput
          label="Valor"
          decimalScale={2}
          min={0}
          key={form.key("amount")}
          {...form.getInputProps("amount")}
        />
        <DatePickerInput
          label="Data"
          key={form.key("date")}
          {...form.getInputProps("date")}
        />
        <Select
          label="Categoria"
          placeholder="Opcional"
          clearable
          data={categories}
          key={form.key("categoryId")}
          {...form.getInputProps("categoryId")}
        />
        <TextInput
          label="Descrição"
          key={form.key("description")}
          {...form.getInputProps("description")}
        />
        {showManualFx && (
          <>
            <Alert
              color="yellow"
              icon={<TriangleAlert size={16} />}
              title="Taxa de câmbio manual"
            >
              O serviço de câmbio está indisponível. Informe manualmente a taxa
              para sua moeda preferida.
            </Alert>
            <NumberInput
              label="Taxa de câmbio manual"
              decimalScale={6}
              min={0}
              key={form.key("manualFxRate")}
              {...form.getInputProps("manualFxRate")}
            />
          </>
        )}
      </FormModal>
    </>
  );
}
