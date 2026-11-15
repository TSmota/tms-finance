import {
  Badge,
  Card,
  Grid,
  GridCol,
  Group,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from "@mantine/core";

import { requireUser } from "@/lib/session";
import { getPeopleOverview } from "@/lib/people";
import { listDebts } from "@/lib/debts";
import { listCreditCardOptions } from "@/lib/creditCards";
import { loadFormOptions } from "@/lib/formOptions";
import { formatCurrency } from "@/lib/currency";
import { AddPersonButton } from "@/components/forms/AddPersonButton";
import { EditPersonButton } from "@/components/forms/EditPersonButton";
import { deletePerson } from "@/actions/people";
import { DeleteEntityButton } from "@/components/forms/DeleteEntityButton";
import { AddDebtButton } from "@/components/forms/AddDebtButton";
import { LinkButton } from "@/components/ui/AppLink";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function PeoplePage() {
  const user = await requireUser();

  const [overview, debts, options, cards] = await Promise.all([
    getPeopleOverview(user.id, user.baseCurrency),
    listDebts(user.id),
    loadFormOptions(user.id),
    listCreditCardOptions(user.id),
  ]);

  const personOptions = overview.people.map((person) => ({
    value: person.id,
    label: person.name,
  }));

  return (
    <Stack gap="lg">
      <PageHeader
        title="Pessoas"
        subtitle="Quem deve a você e a quem você deve"
        action={
          <Group gap="sm">
            {personOptions.length > 0 && (
              <AddDebtButton
                people={personOptions}
                categories={options.categories}
                accounts={options.accounts}
                cards={cards}
                baseCurrency={user.baseCurrency}
              />
            )}
            <AddPersonButton />
          </Group>
        }
      />

      <Grid>
        <GridCol span={{ base: 12, sm: 4 }}>
          <PositionCard
            label="A receber"
            value={overview.totalReceivable}
            currency={user.baseCurrency}
            color="teal"
          />
        </GridCol>
        <GridCol span={{ base: 12, sm: 4 }}>
          <PositionCard
            label="A pagar"
            value={overview.totalPayable}
            currency={user.baseCurrency}
            color="red"
          />
        </GridCol>
        <GridCol span={{ base: 12, sm: 4 }}>
          <PositionCard
            label="Posição líquida"
            value={overview.totalNet}
            currency={user.baseCurrency}
            color={overview.totalNet < 0 ? "red" : "teal"}
            note={
              overview.complete
                ? undefined
                : `Não inclui dívidas sem cotação para ${user.baseCurrency}.`
            }
          />
        </GridCol>
      </Grid>

      <Card withBorder radius="md" padding="lg">
        {overview.people.length === 0 ? (
          <EmptyState message="Nenhuma pessoa ainda. Cadastre quem participa dos seus empréstimos." />
        ) : (
          <TableScrollContainer minWidth={840}>
            <Table highlightOnHover verticalSpacing="sm">
              <TableThead>
                <TableTr>
                  <TableTh>Pessoa</TableTh>
                  <TableTh ta="right">Saldo a receber</TableTh>
                  <TableTh ta="right">Saldo a pagar</TableTh>
                  <TableTh ta="right">Posição líquida</TableTh>
                  <TableTh>Situação / Dívidas</TableTh>
                  <TableTh w={90} ta="right">
                    Ações
                  </TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {overview.people.map((person) => {
                  const personDebts = debts.filter((debt) => debt.personId === person.id);
                  const foreignCurrencies = person.currencies.filter(
                    (currency) => currency !== user.baseCurrency,
                  );

                  return (
                    <TableTr key={person.id}>
                      <TableTd>
                        <Stack gap={2}>
                          <Group gap="xs" wrap="nowrap">
                            <Text size="sm" fw={600}>
                              {person.name}
                            </Text>
                            {foreignCurrencies.map((currency) => (
                              <Badge key={currency} size="xs" variant="outline" color="gray">
                                {currency}
                              </Badge>
                            ))}
                          </Group>
                          {person.notes && (
                            <Text size="xs" c="dimmed" lineClamp={2}>
                              {person.notes}
                            </Text>
                          )}
                        </Stack>
                      </TableTd>
                      <TableTd ta="right">
                        <Text
                          size="sm"
                          fw={person.receivable > 0 ? 600 : 400}
                          c={person.receivable > 0 ? "teal" : "dimmed"}
                        >
                          {formatCurrency(person.receivable, user.baseCurrency)}
                        </Text>
                        {person.settledReceivable > 0 && (
                          <Text size="xs" c="dimmed">
                            {person.receivable === 0
                              ? `Quitado (${formatCurrency(person.settledReceivable, user.baseCurrency)})`
                              : `Quitado: ${formatCurrency(person.settledReceivable, user.baseCurrency)}`}
                          </Text>
                        )}
                      </TableTd>
                      <TableTd ta="right">
                        <Text
                          size="sm"
                          fw={person.payable > 0 ? 600 : 400}
                          c={person.payable > 0 ? "red" : "dimmed"}
                        >
                          {formatCurrency(person.payable, user.baseCurrency)}
                        </Text>
                        {person.settledPayable > 0 && (
                          <Text size="xs" c="dimmed">
                            {person.payable === 0
                              ? `Quitado (${formatCurrency(person.settledPayable, user.baseCurrency)})`
                              : `Quitado: ${formatCurrency(person.settledPayable, user.baseCurrency)}`}
                          </Text>
                        )}
                      </TableTd>
                      <TableTd ta="right">
                        {person.net > 0 ? (
                          <>
                            <Text size="sm" fw={700} c="teal">
                              +{formatCurrency(person.net, user.baseCurrency)}
                            </Text>
                            <Text size="xs" c="teal">
                              Você recebe
                            </Text>
                          </>
                        ) : person.net < 0 ? (
                          <>
                            <Text size="sm" fw={700} c="red">
                              -{formatCurrency(Math.abs(person.net), user.baseCurrency)}
                            </Text>
                            <Text size="xs" c="red">
                              Você paga
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text size="sm" c="dimmed">
                              {formatCurrency(0, user.baseCurrency)}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {person.totalDebts > 0 ? "Quitado" : "Sem pendências"}
                            </Text>
                          </>
                        )}
                        {!person.complete && (
                          <Badge size="xs" color="orange" variant="light" mt={2}>
                            Câmbio parcial
                          </Badge>
                        )}
                      </TableTd>
                      <TableTd>
                        <Group gap="xs" wrap="nowrap">
                          {person.totalDebts === 0 ? (
                            <Badge variant="subtle" color="gray" size="sm">
                              Sem dívidas
                            </Badge>
                          ) : person.openDebts === 0 ? (
                            <Badge variant="light" color="teal" size="sm">
                              Todas quitadas ({person.paidDebts})
                            </Badge>
                          ) : (
                            <Badge variant="light" color="orange" size="sm">
                              {person.openDebts} em aberto
                              {person.paidDebts > 0
                                ? ` (${person.paidDebts} quitada${person.paidDebts > 1 ? "s" : ""})`
                                : ""}
                            </Badge>
                          )}
                          {personDebts.length > 0 && (
                            <LinkButton
                              href={`/dashboard/debts?person=${person.id}`}
                              size="xs"
                              variant="subtle"
                              aria-label={`Ver dívidas de ${person.name}`}
                            >
                              Ver
                            </LinkButton>
                          )}
                        </Group>
                      </TableTd>
                      <TableTd>
                        <Group justify="flex-end" gap={4} wrap="nowrap">
                          <EditPersonButton
                            id={person.id}
                            values={{ name: person.name, notes: person.notes ?? "" }}
                          />
                          <DeleteEntityButton
                            id={person.id}
                            title="Remover pessoa"
                            successMessage="Pessoa removida"
                            question={
                              person.openDebts > 0
                                ? `${person.name} tem ${person.openDebts} ${
                                  person.openDebts === 1 ? "dívida" : "dívidas"
                                } em aberto. Quite ou remova as dívidas antes de remover a pessoa.`
                                : `Remover ${person.name}?`
                            }
                            action={deletePerson}
                            impactTarget="person"
                            blocked={person.openDebts > 0}
                          />
                        </Group>
                      </TableTd>
                    </TableTr>
                  );
                })}
              </TableTbody>
            </Table>
          </TableScrollContainer>
        )}
      </Card>
    </Stack>
  );
}

interface PositionCardProps {
  label: string;
  value: number;
  currency: string;
  color: string;
  note?: string;
}

function PositionCard(props: PositionCardProps) {
  const { label, value, currency, color, note } = props;

  return (
    <Card withBorder radius="md" padding="lg" h="100%">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl" mt="xs" c={color}>
        {formatCurrency(value, currency)}
      </Text>
      {note && (
        <Text size="xs" c="orange" mt={4}>
          {note}
        </Text>
      )}
    </Card>
  );
}
