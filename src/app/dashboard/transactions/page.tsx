import { Card, Group, Stack, Text, Title } from "@mantine/core";

import { requireUser } from "@/lib/session";
import { listMonthTransactions } from "@/lib/transactions";
import { getMonthSummary } from "@/lib/reports";
import { loadFormOptions } from "@/lib/formOptions";
import { materializeRecurring } from "@/lib/recurring";
import { resolveCompetency } from "@/lib/competency";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";
import { MonthSelector } from "@/components/MonthSelector";
import { MonthlyCharts } from "@/components/MonthlyCharts";
import { AddTransactionButton } from "@/components/forms/AddTransactionButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransactionsTable, type TransactionRow } from "@/components/TransactionsTable";

interface TransactionsPageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const user = await requireUser();
  const { month } = await searchParams;
  const competency = resolveCompetency(month);

  // Geração lazy dos recorrentes: roda antes das leituras para que as
  // pendências do mês já apareçam nesta renderização.
  await materializeRecurring(user.id, competency.year, competency.month);

  const [transactions, summary, options] = await Promise.all([
    listMonthTransactions(user.id, competency.year, competency.month),
    getMonthSummary(user.id, competency.year, competency.month, user.baseCurrency),
    loadFormOptions(user.id),
  ]);

  const rows: TransactionRow[] = transactions.map((transaction) => ({
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    // A listagem já filtra lançamentos de conta, então type nunca é INVOICE_PAYMENT.
    type: transaction.type === "INCOME" ? "INCOME" : "EXPENSE",
    status: transaction.status,
    amount: transaction.amount,
    currency: transaction.currency as CurrencyCode,
    convertedAmount: transaction.convertedAmount,
    exchangeRate: transaction.exchangeRate,
    accountId: transaction.accountId ?? "",
    accountName: transaction.accountName ?? "—",
    accountCurrency: (transaction.accountCurrency ?? user.baseCurrency) as CurrencyCode,
    categoryId: transaction.categoryId,
    categoryName: transaction.categoryName,
    categoryColor: transaction.categoryColor,
    isEstimated: transaction.isEstimated,
  }));

  return (
    <Stack gap="lg">
      <PageHeader
        title="Transações"
        subtitle="Entradas e saídas do mês selecionado"
        action={
          options.accounts.length > 0 && (
            <AddTransactionButton
              accounts={options.accounts}
              categories={options.categories}
              baseCurrency={user.baseCurrency}
            />
          )
        }
      />

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
          label="Despesas"
          value={formatCurrency(summary.expenses, user.baseCurrency)}
          color="red"
          note={
            summary.cardSpending > 0
              ? `Saída de caixa. O gasto no cartão do mês (${formatCurrency(summary.cardSpending, user.baseCurrency)}) entra na fatura.`
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
        <Title order={4} mb="md">
          Lançamentos
        </Title>
        <TransactionsTable
          transactions={rows}
          accounts={options.accounts}
          categories={options.categories}
          emptyMessage="Nenhuma transação neste mês."
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
