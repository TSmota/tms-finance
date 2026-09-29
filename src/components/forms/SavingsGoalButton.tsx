"use client";
import { Button, NumberInput, Select, Switch, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { savingsGoalSchema, savingsEntrySchema } from "@/lib/validations";
import { todayCalendarDate } from "@/lib/dates";
import { CURRENCIES } from "@/lib/currency";
import type { SavingsGoalView } from "@/lib/savingsGoals";
import { createSavingsGoal, updateSavingsGoal, addSavingsEntry } from "@/actions/savingsGoals";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

export function SavingsGoalButton(props: { goal?: SavingsGoalView; currency: string }) {
  const { goal, currency } = props;
  const modal = useActionModal({ successMessage: "Meta salva" });
  const form = useForm({ initialValues: { name: goal?.name ?? "", targetAmount: goal?.targetAmount ?? "", currency: goal?.currency ?? currency, dueDate: goal?.dueDate ?? "", paused: goal?.paused ?? false }, validate: zod4Resolver(savingsGoalSchema) });
  return <>
    <Button onClick={modal.open} variant={goal ? "light" : "filled"}>{goal ? "Editar meta" : "Nova meta"}</Button>
    <FormModal opened={modal.opened} onClose={modal.close} title={goal ? "Editar meta" : "Nova meta"} loading={modal.loading} onSubmit={form.onSubmit(async (values) => {
      await modal.run(() => goal ? updateSavingsGoal(goal.id, values) : createSavingsGoal(values));
    })}>
      <TextInput label="Nome da meta" required {...form.getInputProps("name")} />
      <NumberInput label="Valor-alvo" min={0.01} decimalScale={2} required {...form.getInputProps("targetAmount")} />
      <Select label="Moeda" data={[...CURRENCIES]} disabled={Boolean(goal)} description={goal ? "A moeda não pode ser alterada após a criação." : undefined} required {...form.getInputProps("currency")} />
      <TextInput label="Prazo (opcional)" type="date" {...form.getInputProps("dueDate")} />
      <Switch label="Meta pausada" {...form.getInputProps("paused", { type: "checkbox" })} />
    </FormModal>
  </>;
}

export function SavingsEntryButton(props: { goal: SavingsGoalView }) {
  const { goal } = props;
  const modal = useActionModal({ successMessage: "Movimentação registrada" });
  const form = useForm({ initialValues: { amount: "", kind: "CONTRIBUTION", date: todayCalendarDate(), description: "Aporte" }, validate: zod4Resolver(savingsEntrySchema) });
  return <>
    <Button onClick={modal.open} disabled={goal.paused}>Registrar aporte ou retirada</Button>
    <FormModal opened={modal.opened} onClose={modal.close} title={`Movimentar ${goal.name}`} loading={modal.loading} onSubmit={form.onSubmit(async (values) => {
      await modal.run(() => addSavingsEntry(goal.id, values), { onSuccess: () => form.reset() });
    })}>
      <Select label="Movimentação" data={[{ value: "CONTRIBUTION", label: "Aporte" }, { value: "WITHDRAWAL", label: "Retirada" }]} required {...form.getInputProps("kind")} />
      <NumberInput label={`Valor (${goal.currency})`} min={0.01} decimalScale={2} required {...form.getInputProps("amount")} />
      <TextInput label="Data" type="date" required {...form.getInputProps("date")} />
      <TextInput label="Descrição" required {...form.getInputProps("description")} />
    </FormModal>
  </>;
}
