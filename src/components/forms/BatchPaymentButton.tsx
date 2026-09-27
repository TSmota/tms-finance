"use client";
import { useRef, useState } from "react";
import { Alert, Button, Checkbox, Select, Stack, Text, TextInput } from "@mantine/core";
import type { PayableItem } from "@/lib/batchPayments";
import { batchPaymentSchema } from "@/lib/validations";
import { todayCalendarDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/currency";
import { payBatch } from "@/actions/batchPayments";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import type { TransferAccount } from "./TransferButton";

export function BatchPaymentButton(props: { accounts: TransferAccount[]; items: PayableItem[] }) {
  const { accounts, items } = props;
  const modal = useActionModal({ successMessage: "Todos os pagamentos selecionados foram concluídos" });
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayCalendarDate());
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const request = useRef("");
  const account = accounts.find((row) => row.id === accountId);
  const chosen = items.filter((row) => selected.includes(row.id) && row.currency === account?.currency);
  const cents = chosen.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  return <>
    <Button onClick={modal.open} disabled={!items.length || !accounts.length}>Pagar itens selecionados</Button>
    <FormModal opened={modal.opened} onClose={modal.close} title="Pagamento em lote" loading={modal.loading} submitLabel="Confirmar todos os pagamentos" onSubmit={async (event) => {
      event.preventDefault();
      request.current ||= crypto.randomUUID();
      const payload = { requestId: request.current, accountId, date, items: chosen.map((row) => ({ id: row.id, kind: row.kind, expectedAmount: row.amount })) };
      const parsed = batchPaymentSchema.safeParse(payload);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Confira a seleção");
        return;
      }
      setError("");
      await modal.run(() => payBatch(parsed.data), { onSuccess: () => {
        setSelected([]); request.current = "";
      } });
    }}>
      <Text size="sm">Uma conta e data para todos. Se algum item não puder ser pago, nenhum pagamento será registrado. O lote aceita itens na moeda da conta.</Text>
      <Select label="Conta de pagamento" required data={accounts.map((row) => ({ value: row.id, label: `${row.name} (${row.currency})` }))} value={accountId} onChange={(value) => {
        setAccountId(value ?? ""); setSelected([]); request.current = "";
      }} />
      <TextInput label="Data de pagamento" type="date" required value={date} onChange={(event) => {
        setDate(event.currentTarget.value); request.current = "";
      }} />
      <Stack gap="xs">
        {items.filter((row) => row.currency === account?.currency).map((row) => <Checkbox key={`${row.kind}:${row.id}`} label={`${row.kind === "INVOICE" ? "Fatura" : "Dívida"}: ${row.description} — ${formatCurrency(Number(row.amount), row.currency)}`} checked={selected.includes(row.id)} onChange={(event) => {
          setSelected(event.currentTarget.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id)); request.current = "";
        }} />)}
      </Stack>
      <Text fw={600}>{chosen.length} item(ns) — Total: {formatCurrency(cents / 100, account?.currency ?? "BRL")}</Text>
      {error && <Alert color="red" role="alert">{error}</Alert>}
    </FormModal>
  </>;
}
