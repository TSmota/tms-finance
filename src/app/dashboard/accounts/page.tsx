import { Card, Grid, GridCol, Group, Stack, Text, Title } from "@mantine/core";

import { requireUser } from "@/lib/session";
import { getAccountBalances, formatCurrency } from "@/lib/balance";
import { AddAccountButton } from "@/components/forms/AddAccountButton";
import { EmptyState } from "@/components/EmptyState";

const TYPE_LABELS: Record<string, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  INVESTMENT: "Investimento",
  CREDIT_CARD: "Cartão de crédito",
  CASH: "Dinheiro",
};

export default async function AccountsPage() {
  const user = await requireUser();
  const { accounts, netWorth } = await getAccountBalances(
    user.id,
    user.preferredCurrency,
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Contas e investimentos</Title>
        <AddAccountButton />
      </Group>

      <Card withBorder radius="md" padding="lg">
        <Text size="sm" c="dimmed">
          Patrimônio líquido total
        </Text>
        <Text fw={700} size="xl" mt="xs">
          {formatCurrency(netWorth, user.preferredCurrency)}
        </Text>
      </Card>

      {accounts.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <EmptyState message="Nenhuma conta ainda. Adicione uma conta para começar a acompanhar seus saldos." />
        </Card>
      ) : (
        <Grid>
          {accounts.map((account) => (
            <GridCol key={account.id} span={{ base: 12, sm: 6, md: 4 }}>
              <Card withBorder radius="md" padding="lg" h="100%">
                <Group justify="space-between" mb="xs">
                  <Text fw={600}>{account.name}</Text>
                  <Text size="xs" c="dimmed">
                    {TYPE_LABELS[account.type]}
                  </Text>
                </Group>
                <Text fw={700} size="lg">
                  {formatCurrency(account.balance, account.currency)}
                </Text>
                {account.currency !== user.preferredCurrency &&
                  (account.converted ? (
                    <Text size="sm" c="dimmed" mt={4}>
                      ≈ {formatCurrency(
                        account.convertedBalance,
                        user.preferredCurrency,
                      )}
                    </Text>
                  ) : (
                    <Text size="sm" c="orange" mt={4}>
                      Conversão para {user.preferredCurrency} indisponível
                    </Text>
                  ))}
              </Card>
            </GridCol>
          ))}
        </Grid>
      )}
    </Stack>
  );
}
