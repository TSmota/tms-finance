"use client";

import { useState } from "react";
import { Alert, Button, NumberInput, Select, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus, TriangleAlert } from "lucide-react";

import { transactionSchema } from "@/lib/validations";
import { createTransaction } from "@/actions/transactions";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

interface Option {
  value: string;
  label: string;
}

interface AddTransactionButtonProps {
  accounts: Option[];
  categories: Option[];
}

export function AddTransactionButton(props: AddTransactionButtonProps) {
  const { accounts, categories } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Transação adicionada",
  });
  const [showManualFx, setShowManualFx] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      accountId: accounts[0]?.value ?? "",
      categoryId: "",
      type: "OUTFLOW",
      amount: 0,
      date: new Date(),
      description: "",
      manualFxRate: undefined as number | undefined,
    },
    validate: zod4Resolver(transactionSchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => createTransaction(values), {
      onSuccess: () => {
        form.reset();
        setShowManualFx(false);
      },
      onError: (res) => {
        if (res.needsManualFxRate) setShowManualFx(true);
      },
    });
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Adicionar transação
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Adicionar transação"
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
