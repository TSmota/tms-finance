"use client";
import { Button, NumberInput, Select, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { transferSchema } from "@/lib/validations";
import { todayCalendarDate } from "@/lib/dates";
import { createTransfer, updateTransfer } from "@/actions/transfers";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

type TransferValues = { sourceAccountId: string; destinationAccountId: string; amount: number | string; date: string; description: string };
export type TransferAccount = { id: string; name: string; currency: string };

export function TransferButton(props: { accounts: TransferAccount[]; transfer?: TransferValues & { id: string } }) {
  const { accounts, transfer } = props;
  const modal = useActionModal({ successMessage: "Transferência salva" });
  const form = useForm<TransferValues>({ initialValues: transfer ?? { sourceAccountId: "", destinationAccountId: "", amount: "", date: todayCalendarDate(), description: "Transferência entre contas" }, validate: zod4Resolver(transferSchema) });
  const source = accounts.find((account) => account.id === form.values.sourceAccountId);
  const options = accounts.map((account) => ({ value: account.id, label: `${account.name} (${account.currency})` }));
  return <>
    <Button variant={transfer ? "light" : "filled"} onClick={modal.open}>{transfer ? "Editar transferência" : "Nova transferência"}</Button>
    <FormModal opened={modal.opened} onClose={modal.close} title={transfer ? "Editar transferência" : "Nova transferência"} loading={modal.loading} onSubmit={form.onSubmit(async (values) => {
      await modal.run(() => transfer ? updateTransfer(transfer.id, values) : createTransfer(values));
    })}>
      <Select label="Conta de origem" data={options} required {...form.getInputProps("sourceAccountId")} />
      <Select label="Conta de destino" description="Escolha outra conta na mesma moeda." data={options.filter((option) => option.value !== source?.id && accounts.find((account) => account.id === option.value)?.currency === source?.currency)} required {...form.getInputProps("destinationAccountId")} />
      <NumberInput label="Valor" min={0.01} decimalScale={2} required {...form.getInputProps("amount")} />
      <TextInput label="Data" type="date" required {...form.getInputProps("date")} />
      <TextInput label="Descrição" required {...form.getInputProps("description")} />
    </FormModal>
  </>;
}
