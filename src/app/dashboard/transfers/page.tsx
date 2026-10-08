import { Card, Group, Stack, Text } from "@mantine/core";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/accounts";
import { listTransfers } from "@/lib/transfers";
import { deleteTransfer } from "@/actions/transfers";
import { formatCurrency } from "@/lib/currency";
import { formatDay, toCalendarDate } from "@/lib/dates";
import { TransferButton } from "@/components/forms/TransferButton";
import { DeleteEntityButton } from "@/components/forms/DeleteEntityButton";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function TransfersPage() {
  const user = await requireUser();
  const [accounts, transfers] = await Promise.all([listAccounts(user.id), listTransfers(user.id)]);
  const options = accounts.map(({ id, name, currency }) => ({ id, name, currency }));
  return <Stack>
    <PageHeader title="Transferências" subtitle="Movimente saldos entre contas da mesma moeda, sem gerar receitas ou despesas." action={<TransferButton accounts={options} />} />
    <Text size="sm">Histórico das 200 transferências mais recentes. A exportação de dados inclui todo o histórico.</Text>
    {!transfers.length && <Text>Nenhuma transferência registrada.</Text>}
    {transfers.map((row) => <Card withBorder key={row.id}>
      <Stack gap="xs">
        <Text fw={600}>{row.description} — {formatCurrency(Number(row.amount), row.currency)}</Text>
        <Text>{accounts.find((account) => account.id === row.sourceAccountId)?.name} → {accounts.find((account) => account.id === row.destinationAccountId)?.name} · {formatDay(row.date)}</Text>
        <Group><TransferButton accounts={options} transfer={{ id: row.id, sourceAccountId: row.sourceAccountId, destinationAccountId: row.destinationAccountId, amount: row.amount.toFixed(2), date: toCalendarDate(row.date), description: row.description }} />
          <DeleteEntityButton id={row.id} action={deleteTransfer} title="Remover transferência" successMessage="Transferência removida" question="Remover a transferência e estornar os dois saldos?" />
        </Group>
      </Stack>
    </Card>)}
  </Stack>;
}
