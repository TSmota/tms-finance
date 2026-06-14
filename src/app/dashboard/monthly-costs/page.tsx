import {
  Card,
  Group,
  Stack,
  Table,
  TableThead,
  TableTbody,
  TableTr,
  TableTh,
  TableTd,
  Text,
  Title,
  Badge,
} from "@mantine/core";

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
import { EmptyState } from "@/components/EmptyState";

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
    getMonthlyTransactions(user.id, year, monthIndex),
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

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Custos mensais</Title>
        {accounts.length > 0 && (
          <AddTransactionButton
            accounts={accountOptions}
            categories={categoryOptions}
          />
        )}
      </Group>

      <Group align="flex-end">
        <MonthSelector />
      </Group>

      <MonthlyCharts
        byCategory={data.byCategory}
        income={data.income}
        expenses={data.expenses}
      />

      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Transações
        </Title>
        {data.transactions.length === 0 ? (
          <EmptyState message="Nenhuma transação neste mês." />
        ) : (
          <Table highlightOnHover>
            <TableThead>
              <TableTr>
                <TableTh>Data</TableTh>
                <TableTh>Descrição</TableTh>
                <TableTh>Categoria</TableTh>
                <TableTh>Conta</TableTh>
                <TableTh ta="right">Valor</TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {data.transactions.map((transaction) => (
                <TableTr key={transaction.id}>
                  <TableTd>{transaction.date.toLocaleDateString("pt-BR")}</TableTd>
                  <TableTd>{transaction.description}</TableTd>
                  <TableTd>
                    {transaction.categoryName ? (
                      <Badge color={transaction.categoryColor} variant="light">
                        {transaction.categoryName}
                      </Badge>
                    ) : (
                      <Text c="dimmed" size="sm">
                        —
                      </Text>
                    )}
                  </TableTd>
                  <TableTd>{transaction.accountName}</TableTd>
                  <TableTd ta="right">
                    <Text
                      c={transaction.type === "INFLOW" ? "teal" : "red"}
                      fw={500}
                    >
                      {transaction.type === "INFLOW" ? "+" : "-"}
                      {formatCurrency(transaction.convertedAmount, user.preferredCurrency)}
                    </Text>
                  </TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
