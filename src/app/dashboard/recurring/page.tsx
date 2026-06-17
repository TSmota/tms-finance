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
import { getRecurringExpenses, getCategories } from "@/lib/queries";
import { formatCurrency } from "@/lib/balance";
import { AddRecurringButton } from "@/components/forms/AddRecurringButton";
import { AddCategoryButton } from "@/components/forms/AddCategoryButton";
import { RecurringToggle } from "@/components/RecurringToggle";
import { EmptyState } from "@/components/EmptyState";

const INTERVAL_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
  YEARLY: "Anual",
};

/** Normalises any interval to an approximate monthly amount. */
function monthlyEquivalent(amount: number, interval: string): number {
  if (interval === "WEEKLY") return amount * 4.345;
  if (interval === "YEARLY") return amount / 12;
  return amount;
}

export default async function RecurringPage() {
  const user = await requireUser();
  const [items, categories] = await Promise.all([
    getRecurringExpenses(user.id),
    getCategories(user.id),
  ]);

  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  const activeMonthlyTotal = items
    .filter((recurringExpense) => (
      recurringExpense.active && recurringExpense.currency === user.preferredCurrency
    ))
    .reduce((total, recurringExpense) => {
      return total + monthlyEquivalent(recurringExpense.amount, recurringExpense.interval);
    }, 0);

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Despesas recorrentes</Title>
        <Group>
          <AddCategoryButton />
          <AddRecurringButton categories={categoryOptions} />
        </Group>
      </Group>

      <Card withBorder radius="md" padding="lg">
        <Text size="sm" c="dimmed">
          Recorrência mensal aprox. ({user.preferredCurrency})
        </Text>
        <Text fw={700} size="xl" mt="xs">
          {formatCurrency(activeMonthlyTotal, user.preferredCurrency)}
        </Text>
      </Card>

      <Card withBorder radius="md" padding="lg">
        {items.length === 0 ? (
          <EmptyState message="Nenhuma despesa recorrente ainda. Adicione assinaturas e contas para acompanhá-las aqui." />
        ) : (
          <Table highlightOnHover striped>
            <TableThead>
              <TableTr>
                <TableTh>Nome</TableTh>
                <TableTh>Categoria</TableTh>
                <TableTh>Intervalo</TableTh>
                <TableTh ta="right">Valor</TableTh>
                <TableTh ta="center">Ativa</TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {items.map((recurringExpense) => (
                <TableTr key={recurringExpense.id}>
                  <TableTd>{recurringExpense.name}</TableTd>
                  <TableTd>
                    {recurringExpense.categoryName ? (
                      <Badge
                        color={recurringExpense.categoryColor}
                        variant="light"
                      >
                        {recurringExpense.categoryName}
                      </Badge>
                    ) : (
                      <Text c="dimmed" size="sm">
                        —
                      </Text>
                    )}
                  </TableTd>
                  <TableTd>
                    {INTERVAL_LABELS[recurringExpense.interval] ??
                      recurringExpense.interval}
                  </TableTd>
                  <TableTd ta="right">
                    {formatCurrency(recurringExpense.amount, recurringExpense.currency)}
                  </TableTd>
                  <TableTd ta="center">
                    <RecurringToggle
                      id={recurringExpense.id}
                      active={recurringExpense.active}
                    />
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
