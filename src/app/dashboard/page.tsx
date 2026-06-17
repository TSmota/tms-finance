import {
    Card,
    Grid,
    GridCol,
    Group,
    Stack,
    Text,
    Title,
    Badge,
    Table,
    TableThead,
    TableTbody,
    TableTr,
    TableTh,
    TableTd,
} from "@mantine/core";

import { requireUser } from "@/lib/session";
import { getAccountBalances, formatCurrency } from "@/lib/balance";
import { getRecentTransactions, getMonthlyTransactions } from "@/lib/queries";
import { AddTransactionButton } from "@/components/forms/AddTransactionButton";
import { getAccountsList, getCategories } from "@/lib/queries";
import { EmptyState } from "@/components/EmptyState";

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

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Painel</Title>
        {accounts.length > 0 && (
          <AddTransactionButton
            accounts={accountOptions}
            categories={categoryOptions}
          />
        )}
      </Group>

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
        {recent.length === 0 ? (
          <EmptyState message="Nenhuma transação ainda. Adicione a primeira para começar." />
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
              {recent.map((transaction) => (
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
                      {formatCurrency(
                        transaction.amount,
                        transaction.accountCurrency,
                      )}
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
