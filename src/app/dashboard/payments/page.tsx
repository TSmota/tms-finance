import { Card, Stack, Text } from "@mantine/core";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/accounts";
import { listPayables } from "@/lib/batchPayments";
import { formatCurrency } from "@/lib/currency";
import { BatchPaymentButton } from "@/components/forms/BatchPaymentButton";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function PaymentsPage() {
  const user = await requireUser();
  const [accounts, items] = await Promise.all([listAccounts(user.id), listPayables(user.id)]);
  return <Stack>
    <PageHeader title="Pagamentos em lote" subtitle="Selecione faturas e dívidas a pagar. O pagamento é integral e atômico, com uma conta e data comuns." action={<BatchPaymentButton accounts={accounts.map(({ id, name, currency }) => ({ id, name, currency }))} items={items} />} />
    {!items.length && <Text>Nenhum pagamento em aberto.</Text>}
    {items.map((row) => <Card key={`${row.kind}:${row.id}`} withBorder><Text>{row.kind === "INVOICE" ? "Fatura" : "Dívida"}: {row.description} — {formatCurrency(Number(row.amount), row.currency)}</Text></Card>)}
  </Stack>;
}
