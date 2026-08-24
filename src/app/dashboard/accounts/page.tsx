import { Badge, Card, Grid, GridCol, Group, Stack, Text, Title } from "@mantine/core";
import { Landmark } from "lucide-react";

import { requireUser } from "@/lib/session";
import { getAccountBalances, listAccounts } from "@/lib/accounts";
import { ACCOUNT_TYPE_LABELS } from "@/lib/accountTypes";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";
import { groupByInstitution } from "@/lib/grouping";
import { AddAccountButton } from "@/components/forms/AddAccountButton";
import { EditAccountButton } from "@/components/forms/EditAccountButton";
import { DeleteAccountButton } from "@/components/forms/DeleteAccountButton";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function AccountsPage() {
  const user = await requireUser();

  const [{ accounts, netWorth, netWorthComplete }, raw] = await Promise.all([
    getAccountBalances(user.id, user.baseCurrency),
    listAccounts(user.id),
  ]);

  // O saldo inicial não faz parte do resumo de saldos; vem da entidade crua.
  const initialBalanceById = new Map(
    raw.map((account) => [account.id, Number(account.initialBalance)]),
  );

  const groups = groupByInstitution(accounts);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Contas e carteiras"
        subtitle="Saldos das suas contas, agrupados por instituição"
        action={<AddAccountButton baseCurrency={user.baseCurrency} />}
      />

      <Card withBorder radius="md" padding="lg">
        <Text size="sm" c="dimmed">
          Patrimônio líquido total
        </Text>
        <Text fw={700} size="xl" mt="xs">
          {formatCurrency(netWorth, user.baseCurrency)}
        </Text>
        {!netWorthComplete && (
          <Text size="xs" c="orange" mt={4}>
            Não inclui contas com cotação indisponível para {user.baseCurrency}.
          </Text>
        )}
      </Card>

      {accounts.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <EmptyState message="Nenhuma conta ainda. Adicione uma conta para começar a acompanhar seus saldos." />
        </Card>
      ) : (
        groups.map(({ institution, items }) => (
          <Stack key={institution} gap="xs">
            <Group gap="xs">
              <Landmark size={16} color="var(--mantine-color-dimmed)" />
              <Title order={5} c="dimmed">
                {institution}
              </Title>
              <Badge variant="light" color="gray" size="sm">
                {items.length}
              </Badge>
            </Group>

            <Grid>
              {items.map((account) => (
                <GridCol key={account.id} span={{ base: 12, sm: 6, md: 4 }}>
                  <Card withBorder radius="md" padding="lg" h="100%">
                    <Group justify="space-between" mb="xs" wrap="nowrap">
                      <Text fw={600}>{account.name}</Text>
                      <Badge variant="light" color="gray" size="sm" tt="none" fw={500}>
                        {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                      </Badge>
                    </Group>
                    <Text fw={700} size="lg">
                      {formatCurrency(account.balance, account.currency)}
                    </Text>
                    {account.currency !== user.baseCurrency &&
                      (account.converted ? (
                        <Text size="sm" c="dimmed" mt={4}>
                          ≈ {formatCurrency(account.convertedBalance, user.baseCurrency)}
                        </Text>
                      ) : (
                        <Text size="sm" c="orange" mt={4}>
                          Conversão para {user.baseCurrency} indisponível
                        </Text>
                      ))}

                    <Group justify="flex-end" mt="md">
                      <EditAccountButton
                        id={account.id}
                        name={account.name}
                        type={account.type}
                        institution={account.institution}
                        currency={account.currency as CurrencyCode}
                        initialBalance={initialBalanceById.get(account.id) ?? 0}
                      />
                      <DeleteAccountButton id={account.id} name={account.name} />
                    </Group>
                  </Card>
                </GridCol>
              ))}
            </Grid>
          </Stack>
        ))
      )}
    </Stack>
  );
}
