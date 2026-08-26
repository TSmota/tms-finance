import { Alert, Card, Group, Stack, Text, Title } from "@mantine/core";
import { TriangleAlert } from "lucide-react";

import { requireUser } from "@/lib/session";
import { listMonthTransactions } from "@/lib/transactions";
import { getMonthSummary } from "@/lib/reports";
import { loadFormOptions } from "@/lib/formOptions";
import { resolveCompetency } from "@/lib/competency";
import { formatCurrency } from "@/lib/currency";
import { toTransactionRow, type TransactionRow } from "@/lib/transactionRow";
import { MonthSelector } from "@/components/MonthSelector";
import { MonthlyCharts } from "@/components/MonthlyCharts";
import { AddTransactionButton } from "@/components/forms/AddTransactionButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransactionsTable } from "@/components/TransactionsTable";

interface TransactionsPageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const user = await requireUser();
  const { month } = await searchParams;
  const competency = resolveCompetency(month);

  const [transactions, summary, options] = await Promise.all([
    listMonthTransactions(user.id, competency.year, competency.month),
    getMonthSummary(user.id, competency.year, competency.month, user.baseCurrency),
    loadFormOptions(user.id),
  ]);

  const rows: TransactionRow[] = transactions.map((transaction) =>
    toTransactionRow(transaction, user.baseCurrency),
  );

  const addButton = (
    <AddTransactionButton
      accounts={options.accounts}
      categories={options.categories}
      baseCurrency={user.baseCurrency}
    />
  );

  return (
    <Stack gap="lg">
      <PageHeader
        title="Transações"
        subtitle="Entradas e saídas do mês selecionado"
        action={options.accounts.length > 0 && addButton}
      />

      {options.accounts.length === 0 && (
        <Alert color="blue" variant="light" icon={<TriangleAlert size={16} />}>
          Cadastre uma conta em Contas antes de lançar uma transação: todo lançamento move o
          saldo de alguma.
        </Alert>
      )}

      <Group align="flex-end">
        <MonthSelector />
      </Group>

      <Group grow align="stretch">
        <SummaryCard
          label="Receitas"
          value={formatCurrency(summary.income, user.baseCurrency)}
          color="teal"
        />
        <SummaryCard
          label="Saídas de caixa"
          value={formatCurrency(summary.expenses, user.baseCurrency)}
          color="red"
          note={
            summary.cardSpending > 0
              ? `O gasto no cartão do mês (${formatCurrency(summary.cardSpending, user.baseCurrency)}) só entra aqui quando a fatura é paga.`
              : undefined
          }
        />
        <SummaryCard
          label="Resultado"
          value={formatCurrency(summary.net, user.baseCurrency)}
          color={summary.net < 0 ? "red" : "teal"}
          note={
            summary.complete
              ? undefined
              : `Não inclui contas sem cotação para ${user.baseCurrency}.`
          }
          noteTone="warning"
        />
      </Group>

      <MonthlyCharts
        byCategory={summary.byCategory}
        spendingTotal={summary.spendingTotal}
        income={summary.income}
        expenses={summary.expenses}
        cardSpending={summary.cardSpending}
        currency={user.baseCurrency}
      />

      <Card withBorder radius="md" padding="lg">
        <Title order={2} size="h4" mb="md">
          Lançamentos
        </Title>
        <TransactionsTable
          transactions={rows}
          accounts={options.accounts}
          categories={options.categories}
          emptyMessage="Nenhuma transação neste mês."
          emptyAction={options.accounts.length > 0 ? addButton : undefined}
        />
      </Card>
    </Stack>
  );
}

interface SummaryCardProps {
  label: string;
  value: string;
  color: string;
  note?: string;
  /** `warning` deixa a nota em laranja; o padrão é explicação neutra. */
  noteTone?: "warning" | "muted";
}

function SummaryCard(props: SummaryCardProps) {
  const { label, value, color, note, noteTone = "muted" } = props;

  return (
    <Card withBorder radius="md" padding="lg">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl" mt="xs" c={color}>
        {value}
      </Text>
      {note && (
        <Text size="xs" c={noteTone === "warning" ? "orange" : "dimmed"} mt={4}>
          {note}
        </Text>
      )}
    </Card>
  );
}
