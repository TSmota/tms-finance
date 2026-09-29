import { Badge, Card, Group, Progress, Stack, Text } from "@mantine/core";
import { requireUser } from "@/lib/session";
import { listSavingsGoals } from "@/lib/savingsGoals";
import { formatCurrency } from "@/lib/currency";
import { formatDay, parseCalendarDate } from "@/lib/dates";
import { SavingsGoalButton, SavingsEntryButton } from "@/components/forms/SavingsGoalButton";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function GoalsPage() {
  const user = await requireUser();
  const goals = await listSavingsGoals(user.id);
  return <Stack>
    <PageHeader title="Metas de poupança" subtitle="Acompanhamento manual: aportes e retiradas não movimentam suas contas nem alteram o patrimônio." action={<SavingsGoalButton currency={user.baseCurrency} />} />
    {!goals.length && <Text>Crie sua primeira meta para acompanhar a poupança.</Text>}
    {goals.map((goal) => <Card withBorder key={goal.id}><Stack gap="sm">
      <Group justify="space-between"><Text fw={600}>{goal.name}</Text><Badge>{goal.status === "PAUSED" ? "Pausada" : goal.status === "COMPLETED" ? "Concluída" : "Ativa"}</Badge></Group>
      <Text>{formatCurrency(Number(goal.progress), goal.currency)} de {formatCurrency(Number(goal.targetAmount), goal.currency)} · {goal.percentage.toFixed(1)}%</Text>
      <Progress value={Math.min(100, goal.percentage)} aria-label={`Progresso de ${goal.name}`} />
      {goal.dueDate && <Text>Prazo: {formatDay(parseCalendarDate(goal.dueDate))}</Text>}
      <Group><SavingsGoalButton goal={goal} currency={goal.currency} /><SavingsEntryButton goal={goal} /></Group>
      <details><summary>Histórico de aportes e retiradas ({goal.entries.length})</summary>
        {!goal.entries.length && <Text>Nenhuma movimentação.</Text>}
        {goal.entries.map((entry) => <Text key={entry.id}>{formatDay(parseCalendarDate(entry.date))} · {entry.description} · {formatCurrency(Number(entry.amount), goal.currency)}</Text>)}
      </details>
    </Stack></Card>)}
  </Stack>;
}
