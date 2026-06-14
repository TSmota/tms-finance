"use client";

import { useState } from "react";
import {
    Button,
    Modal,
    NumberInput,
    Select,
    Stack,
    TextInput,
    Alert,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Plus, TriangleAlert } from "lucide-react";

import { transactionSchema } from "@/lib/validations";
import { createTransaction } from "@/actions/transactions";

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

  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    const res = await createTransaction(values);
    setLoading(false);
    if (!res.ok) {
      if (res.needsManualFxRate) {
        setShowManualFx(true);
      }
      notifications.show({ color: "red", message: res.error ?? "Falha ao salvar" });
      return;
    }
    notifications.show({ color: "teal", message: "Transação adicionada" });
    form.reset();
    setShowManualFx(false);
    close();
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Adicionar transação
      </Button>
      <Modal opened={opened} onClose={close} title="Adicionar transação" centered>
        <form onSubmit={handleSubmit}>
          <Stack>
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
                  O serviço de câmbio está indisponível. Informe manualmente a
                  taxa para sua moeda preferida.
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
            <Button type="submit" loading={loading}>
              Salvar
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
