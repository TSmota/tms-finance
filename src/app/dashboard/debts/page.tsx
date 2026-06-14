import {
  Card,
  Grid,
  GridCol,
  Group,
  Progress,
  Stack,
  Text,
  Title,
  Badge,
} from "@mantine/core";

import { requireUser } from "@/lib/session";
import { getDebts } from "@/lib/queries";
import { formatCurrency } from "@/lib/balance";
import { EmptyState } from "@/components/EmptyState";
import { AddDebtButton } from "@/components/forms/AddDebtButton";
import { AddPaymentButton } from "@/components/forms/AddPaymentButton";

const STATUS_COLORS: Record<string, string> = {
  PAID: "teal",
  PARTIAL: "yellow",
  PENDING: "gray",
};

const STATUS_LABELS: Record<string, string> = {
  PAID: "Pago",
  PARTIAL: "Parcial",
  PENDING: "Pendente",
};

export default async function DebtsPage() {
  const user = await requireUser();
  const debts = await getDebts(user.id);
  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Dívidas</Title>
        <AddDebtButton />
      </Group>

      {debts.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <EmptyState message="Nenhuma dívida acompanhada." />
        </Card>
      ) : (
        <Grid>
          {debts.map((debt) => {
            const paidPercentage = debt.totalAmount > 0 ? (debt.paid / debt.totalAmount) * 100 : 0;

            return (
              <GridCol key={debt.id} span={{ base: 12, sm: 6, md: 4 }}>
                <Card withBorder radius="md" padding="lg" h="100%">
                  <Group justify="space-between" mb="xs">
                    <Text fw={600}>{debt.debtorName}</Text>
                    <Badge color={STATUS_COLORS[debt.status]}>
                      {STATUS_LABELS[debt.status]}
                    </Badge>
                  </Group>
                  {debt.description && (
                    <Text size="sm" c="dimmed" mb="xs">
                      {debt.description}
                    </Text>
                  )}
                  <Text size="sm">
                    Pago {formatCurrency(debt.paid, debt.currency)} de{" "}
                    {formatCurrency(debt.totalAmount, debt.currency)}
                  </Text>
                  <Progress
                    value={paidPercentage}
                    color={STATUS_COLORS[debt.status]}
                    mt="xs"
                    mb="xs"
                  />
                  <Text size="sm" fw={500}>
                    Restante: {formatCurrency(debt.remaining, debt.currency)}
                  </Text>
                  {debt.dueDate && (
                    <Text size="xs" c="dimmed" mt="xs">
                      Vence em {debt.dueDate.toLocaleDateString("pt-BR")}
                    </Text>
                  )}
                  {debt.status !== "PAID" && (
                    <AddPaymentButton debtId={debt.id} />
                  )}
                </Card>
              </GridCol>
            );
          })}
        </Grid>
      )}
    </Stack>
  );
}
