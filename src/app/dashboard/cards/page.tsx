import {
  Badge,
  Card,
  Grid,
  GridCol,
  Group,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { ChevronRight, Landmark } from "lucide-react";

import { requireUser } from "@/lib/session";
import { listCreditCards } from "@/lib/creditCards";
import { listAccounts } from "@/lib/accounts";
import { listCategoryOptions } from "@/lib/categories";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";
import { groupByInstitution } from "@/lib/grouping";
import { AddCreditCardButton } from "@/components/forms/AddCreditCardButton";
import { EditCreditCardButton } from "@/components/forms/EditCreditCardButton";
import { DeleteCreditCardButton } from "@/components/forms/DeleteCreditCardButton";
import { AddCardPurchaseButton } from "@/components/forms/AddCardPurchaseButton";
import { LinkButton } from "@/components/ui/AppLink";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function CardsPage() {
  const user = await requireUser();

  const [cards, accounts, categories] = await Promise.all([
    listCreditCards(user.id),
    listAccounts(user.id),
    listCategoryOptions(user.id),
  ]);

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: account.name,
    currency: account.currency,
  }));

  const cardOptions = cards.map((card) => ({
    value: card.id,
    label: card.name,
    currency: card.currency,
  }));

  const groups = groupByInstitution(cards);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Cartões de crédito"
        subtitle="Faturas, limites e lançamentos parcelados"
        action={
          <Group gap="sm">
            {cards.length > 0 && (
              <AddCardPurchaseButton
                cards={cardOptions}
                categories={categories}
                baseCurrency={user.baseCurrency}
              />
            )}
            <AddCreditCardButton
              accounts={accountOptions}
              baseCurrency={user.baseCurrency}
            />
          </Group>
        }
      />

      {cards.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <EmptyState message="Nenhum cartão ainda. Adicione um cartão para começar a acompanhar suas faturas." />
        </Card>
      ) : (
        groups.map(({ institution, items }) => (
          <Stack key={institution} gap="xs">
            <Group gap="xs">
              <Landmark size={16} color="var(--mantine-color-dimmed)" />
              <Title order={2} size="h5" c="dimmed">
                {institution}
              </Title>
              <Badge variant="light" color="gray" size="sm">
                {items.length}
              </Badge>
            </Group>

            <Grid>
              {items.map((card) => {
                const usagePercent =
                  card.creditLimit && card.creditLimit > 0
                    ? Math.min((card.usedLimit / card.creditLimit) * 100, 100)
                    : null;
                const overLimit =
                  card.availableLimit !== null && card.availableLimit < 0;

                return (
                  <GridCol key={card.id} span={{ base: 12, md: 6 }}>
                    <Card withBorder radius="md" padding="lg" h="100%">
                      <Group justify="space-between" mb="xs" wrap="nowrap">
                        <Text fw={600}>{card.name}</Text>
                        <Badge variant="light" color="gray" size="sm" tt="none" fw={500}>
                          Fecha dia {card.closingDay} · vence dia {card.dueDay}
                        </Badge>
                      </Group>

                      <Text size="sm" c="dimmed">
                        Em aberto
                      </Text>
                      <Text fw={700} size="lg">
                        {formatCurrency(card.usedLimit, card.currency)}
                      </Text>

                      {card.creditLimit !== null && (
                        <>
                          <Progress
                            value={usagePercent ?? 0}
                            color={overLimit ? "red" : usagePercent! > 80 ? "orange" : "teal"}
                            mt="sm"
                            mb={4}
                            aria-label={`Limite usado do cartão ${card.name}`}
                          />
                          <Text size="xs" c={overLimit ? "red" : "dimmed"}>
                            {overLimit
                              ? `Limite estourado em ${formatCurrency(Math.abs(card.availableLimit!), card.currency)}`
                              : `${formatCurrency(card.availableLimit!, card.currency)} disponíveis de ${formatCurrency(card.creditLimit, card.currency)}`}
                          </Text>
                        </>
                      )}

                      {card.defaultPaymentAccountName && (
                        <Text size="xs" c="dimmed" mt="xs">
                          Pagamento padrão: {card.defaultPaymentAccountName}
                        </Text>
                      )}

                      <Group justify="space-between" mt="md" wrap="nowrap">
                        <LinkButton
                          href={`/dashboard/cards/${card.id}`}
                          rightSection={<ChevronRight size={14} />}
                        >
                          {card.openInvoiceCount === 0
                            ? "Ver faturas"
                            : `${card.openInvoiceCount} ${card.openInvoiceCount === 1 ? "fatura aberta" : "faturas abertas"}`}
                        </LinkButton>
                        <Group gap={4} wrap="nowrap">
                          <EditCreditCardButton
                            id={card.id}
                            currency={card.currency as CurrencyCode}
                            accounts={accountOptions}
                            values={{
                              name: card.name,
                              institution: card.institution ?? "",
                              closingDay: card.closingDay,
                              dueDay: card.dueDay,
                              currency: card.currency,
                              creditLimit: card.creditLimit,
                              defaultPaymentAccountId: card.defaultPaymentAccountId ?? "",
                            }}
                          />
                          <DeleteCreditCardButton id={card.id} name={card.name} />
                        </Group>
                      </Group>
                    </Card>
                  </GridCol>
                );
              })}
            </Grid>
          </Stack>
        ))
      )}
    </Stack>
  );
}
