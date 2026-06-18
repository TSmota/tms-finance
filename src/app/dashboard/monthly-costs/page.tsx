import { Card, Group, Stack, Text, Title } from "@mantine/core";

import { requireUser } from "@/lib/session";
import {
    getMonthlyTransactions,
    getAccountsList,
    getCategories,
} from "@/lib/queries";
import { formatCurrency } from "@/lib/balance";
import { MonthSelector } from "@/components/MonthSelector";
import { MonthlyCharts } from "@/components/MonthlyCharts";
import { AddTransactionButton } from "@/components/forms/AddTransactionButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransactionsTable, type TransactionRow } from "@/components/TransactionsTable";

interface MonthlyCostsPageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function MonthlyCostsPage({ searchParams }: MonthlyCostsPageProps) {
  const user = await requireUser();
  const { month } = await searchParams;

  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [selectedYear, selectedMonth] = month.split("-").map(Number);
    year = selectedYear;
    monthIndex = selectedMonth - 1;
  }

  const [data, accounts, categories] = await Promise.all([
    getMonthlyTransactions(user.id, year, monthIndex, user.preferredCurrency),
    getAccountsList(user.id),
    getCategories(user.id),
  ]);

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: account.name,
  }));
  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  const rows: TransactionRow[] = data.transactions.map((transaction) => ({
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    type: transaction.type,
    amount: transaction.amount,
    accountId: transaction.accountId,
    accountName: transaction.accountName,
    accountCurrency: transaction.accountCurrency,
    categoryId: transaction.categoryId,
    categoryName: transaction.categoryName,
    categoryColor: transaction.categoryColor,
    displayAmount: transaction.convertedAmount,
    displayCurrency: user.preferredCurrency,
  }));

  return (
    <Stack gap="lg">
      <PageHeader
        title="Custos mensais"
        subtitle="Receitas e despesas do mês selecionado"
        action={
          accounts.length > 0 && (
            <AddTransactionButton
              accounts={accountOptions}
              categories={categoryOptions}
            />
          )
        }
      />

      <Group align="flex-end">
        <MonthSelector />
      </Group>

      <MonthlyCharts
        byCategory={data.byCategory}
        income={data.income}
        expenses={data.expenses}
        actualExpenses={data.actualExpenses}
        projectedRecurringExpenses={data.projectedRecurringExpenses}
      />

      <Card withBorder radius="md" padding="lg">
        <Text size="sm" c="dimmed">
          Despesas projetadas recorrentes ({user.preferredCurrency})
        </Text>
        <Text fw={700} size="xl" mt="xs" c="orange">
          {formatCurrency(data.projectedRecurringExpenses, user.preferredCurrency)}
        </Text>
        {!data.recurringProjectionComplete && (
          <Text size="xs" c="orange" mt={4}>
            Não inclui recorrências com conversão cambial indisponível.
          </Text>
        )}
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Transações
        </Title>
        <TransactionsTable
          transactions={rows}
          accounts={accountOptions}
          categories={categoryOptions}
          emptyMessage="Nenhuma transação neste mês."
        />
      </Card>
    </Stack>
  );
}
