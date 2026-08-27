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

  const [overview, debts, options] = await Promise.all([
    getPeopleOverview(user.id, user.baseCurrency),
    listDebts(user.id),
    loadFormOptions(user.id),
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
          <TableScrollContainer minWidth={720}>
            <Table highlightOnHover>
              <TableThead>
                <TableTr>
                  <TableTh>Pessoa</TableTh>
                  <TableTh ta="right">A receber</TableTh>
                  <TableTh ta="right">A pagar</TableTh>
                  <TableTh ta="right">Posição</TableTh>
                  <TableTh>Dívidas</TableTh>
                  <TableTh w={80} />
                </TableTr>
              </TableThead>
              <TableTbody>
                {overview.people.map((person) => {
                  const personDebts = debts.filter((debt) => debt.personId === person.id);

                  return (
                    <TableTr key={person.id}>
                      <TableTd>
                        <Stack gap={0}>
                          <Text size="sm" fw={500}>
                            {person.name}
                          </Text>
                          {person.notes && (
                            <Text size="xs" c="dimmed">
                              {person.notes}
                            </Text>
                          )}
                        </Stack>
                      </TableTd>
                      <TableTd ta="right">
                        <Text size="sm" c={person.receivable > 0 ? "teal" : "dimmed"}>
                          {formatCurrency(person.receivable, user.baseCurrency)}
                        </Text>
                      </TableTd>
                      <TableTd ta="right">
                        <Text size="sm" c={person.payable > 0 ? "red" : "dimmed"}>
                          {formatCurrency(person.payable, user.baseCurrency)}
                        </Text>
                      </TableTd>
                      <TableTd ta="right">
                        <Text size="sm" fw={600} c={person.net < 0 ? "red" : undefined}>
                          {formatCurrency(person.net, user.baseCurrency)}
                        </Text>
                        {!person.complete && (
                          <Text size="xs" c="orange">
                            parcial
                          </Text>
                        )}
                      </TableTd>
                      <TableTd>
                        <Group gap="xs" wrap="nowrap">
                          <Badge
                            variant="light"
                            color={person.openDebts > 0 ? "orange" : "gray"}
                            size="sm"
                          >
                            {person.openDebts} em aberto
                          </Badge>
                          {personDebts.length > 0 && (
                            <LinkButton href={`/dashboard/debts?person=${person.id}`}>
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
