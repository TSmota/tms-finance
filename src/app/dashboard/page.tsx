import { Card, Grid, GridCol, Stack, Text, Title } from "@mantine/core";

import { requireUser } from "@/lib/session";
import { getAccountBalances, formatCurrency } from "@/lib/balance";
import {
    getRecentTransactions,
    getMonthlyTransactions,
    getAccountsList,
    getCategories,
} from "@/lib/queries";
import { AddTransactionButton } from "@/components/forms/AddTransactionButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransactionsTable, type TransactionRow } from "@/components/TransactionsTable";

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();

  const [{ netWorth, netWorthComplete }, recent, monthly, accounts, categories] =
    await Promise.all([
      getAccountBalances(user.id, user.preferredCurrency),
      getRecentTransactions(user.id),
      getMonthlyTransactions(user.id, now.getFullYear(), now.getMonth(), user.preferredCurrency),
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

  const rows: TransactionRow[] = recent.map((transaction) => ({
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    type: transaction.type as "INFLOW" | "OUTFLOW",
    amount: transaction.amount,
    accountId: transaction.accountId,
    accountName: transaction.accountName,
    accountCurrency: transaction.accountCurrency,
    categoryId: transaction.categoryId,
    categoryName: transaction.categoryName,
    categoryColor: transaction.categoryColor,
    displayAmount: transaction.amount,
    displayCurrency: transaction.accountCurrency,
  }));

  return (
    <Stack gap="lg">
      <PageHeader
        title="Painel"
        subtitle="Visão geral das suas finanças"
        action={
          accounts.length > 0 && (
            <AddTransactionButton
              accounts={accountOptions}
              categories={categoryOptions}
            />
          )
        }
      />

      <Grid>
        <GridCol span={{ base: 12, sm: 4 }}>
          <Card withBorder radius="md" padding="lg" h="100%">
            <Text size="sm" c="dimmed">
              Patrimônio líquido
            </Text>
            <Text fw={700} size="xl" mt="xs">
              {formatCurrency(netWorth, user.preferredCurrency)}
            </Text>
            {!netWorthComplete && (
              <Text size="xs" c="orange" mt={4}>
                Não inclui contas com taxas de câmbio indisponíveis.
              </Text>
            )}
          </Card>
        </GridCol>
        <GridCol span={{ base: 12, sm: 4 }}>
          <Card withBorder radius="md" padding="lg" h="100%">
            <Text size="sm" c="dimmed">
              Receitas deste mês
            </Text>
            <Text fw={700} size="xl" mt="xs" c="teal">
              {formatCurrency(monthly.income, user.preferredCurrency)}
            </Text>
          </Card>
        </GridCol>
        <GridCol span={{ base: 12, sm: 4 }}>
          <Card withBorder radius="md" padding="lg" h="100%">
            <Text size="sm" c="dimmed">
              Despesas deste mês
            </Text>
            <Text fw={700} size="xl" mt="xs" c="red">
              {formatCurrency(monthly.expenses, user.preferredCurrency)}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              Inclui {formatCurrency(monthly.projectedRecurringExpenses, user.preferredCurrency)} de recorrências projetadas.
            </Text>
            {!monthly.recurringProjectionComplete && (
              <Text size="xs" c="orange" mt={4}>
                Algumas recorrências não foram convertidas para {user.preferredCurrency}.
              </Text>
            )}
          </Card>
        </GridCol>
      </Grid>

      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Atividade recente
        </Title>
        <TransactionsTable
          transactions={rows}
          accounts={accountOptions}
          categories={categoryOptions}
        />
      </Card>
    </Stack>
  );
}
