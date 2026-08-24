import {
  Alert,
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
  Title,
} from "@mantine/core";
import { CalendarClock, CreditCard, TriangleAlert, Wallet } from "lucide-react";

import { requireUser } from "@/lib/session";
import {
  listPendingOccurrences,
  listRecurringExpenses,
  materializeRecurring,
  type RecurringListItem,
} from "@/lib/recurring";
import { getBalanceProjection } from "@/lib/projection";
import { listCreditCards } from "@/lib/creditCards";
import { loadFormOptions } from "@/lib/formOptions";
import { toCalendarDate } from "@/lib/dates";
import { DEFAULT_CATEGORY_COLOR, formatCurrency, type CurrencyCode } from "@/lib/currency";
import { FREQUENCY_LABELS } from "@/lib/recurrence";
import { MonthSelector } from "@/components/MonthSelector";
import { AddRecurringButton } from "@/components/forms/AddRecurringButton";
import { EditRecurringButton } from "@/components/forms/EditRecurringButton";
import { DeleteRecurringButton } from "@/components/forms/DeleteRecurringButton";
import { RecurringActiveToggle } from "@/components/forms/RecurringActiveToggle";
import { ConfirmPendingButton } from "@/components/forms/ConfirmPendingButton";
import { joinTarget } from "@/lib/recurringTarget";
import type { RecurringFormValues } from "@/components/forms/RecurringFields";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { resolveCompetency } from "@/lib/competency";

interface RecurringPageProps {
  searchParams: Promise<{ month?: string }>;
}

/** Data curta em UTC — as datas do domínio são todas meia-noite UTC. */
function formatDay(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Valores iniciais do formulário de edição, a partir do que está gravado. */
function toFormValues(item: RecurringListItem): RecurringFormValues {
  return {
    description: item.description,
    amount: item.amount,
    currency: item.currency,
    frequency: item.frequency,
    dueDay: item.dueDay,
    isEstimated: item.isEstimated,
    startDate: toCalendarDate(item.startDate),
    endDate: item.endDate ? toCalendarDate(item.endDate) : "",
    categoryId: item.categoryId,
    target: joinTarget(item.accountId, item.creditCardId),
  };
}

/** Como a recorrência é cobrada, em uma linha. */
function targetLabel(item: RecurringListItem): string {
  return item.accountName ?? item.creditCardName ?? "—";
}

export default async function RecurringPage({ searchParams }: RecurringPageProps) {
  const user = await requireUser();
  const { month } = await searchParams;
  const competency = resolveCompetency(month);

  // Geração lazy: abrir o mês materializa as ocorrências. Idempotente, então
  // re-renderizações não duplicam nada.
  const materialization = await materializeRecurring(
    user.id,
    competency.year,
    competency.month,
  );

  const [recurrings, pending, projection, cards, options] = await Promise.all([
    listRecurringExpenses(user.id),
    listPendingOccurrences(user.id, competency.year, competency.month),
    getBalanceProjection(user.id, competency.year, competency.month, user.baseCurrency),
    listCreditCards(user.id),
    loadFormOptions(user.id),
  ]);

  const cardOptions = cards.map((card) => ({
    value: card.id,
    label: card.name,
    currency: card.currency,
  }));

  const canCreate = options.categories.length > 0 && cardOptions.length + options.accounts.length > 0;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Recorrentes"
        subtitle="Gastos que se repetem, com projeção antes da confirmação"
        action={
          canCreate && (
            <AddRecurringButton
              accounts={options.accounts}
              cards={cardOptions}
              categories={options.categories}
              baseCurrency={user.baseCurrency}
            />
          )
        }
      />

      <Group align="flex-end">
        <MonthSelector />
      </Group>

      {!canCreate && (
        <Alert color="blue" variant="light" icon={<TriangleAlert size={16} />}>
          Para criar uma recorrência você precisa de ao menos uma categoria e uma conta ou cartão.
        </Alert>
      )}

      {materialization.skipped.length > 0 && (
        <Alert color="orange" variant="light" icon={<TriangleAlert size={16} />}>
          Sem cotação de câmbio para {materialization.skipped.join(", ")}. As ocorrências serão
          geradas quando o serviço voltar.
        </Alert>
      )}

      <Grid>
        <GridCol span={{ base: 12, md: 6 }}>
          <Card withBorder radius="md" padding="lg" h="100%">
            <Text size="sm" c="dimmed">
              Saldo projetado até o fim do mês
            </Text>
            <Text
              fw={700}
              size="xl"
              mt="xs"
              c={projection.projectedBalance < 0 ? "red" : "teal"}
            >
              {formatCurrency(projection.projectedBalance, user.baseCurrency)}
            </Text>
            <Stack gap={2} mt="sm">
              <ProjectionLine
                label="Saldo atual"
                value={projection.currentBalance}
                currency={user.baseCurrency}
              />
              {projection.pendingIncome > 0 && (
                <ProjectionLine
                  label="Recebimentos previstos"
                  value={projection.pendingIncome}
                  currency={user.baseCurrency}
                  sign="+"
                />
              )}
              <ProjectionLine
                label={`Pendências a pagar (${projection.pendingCount})`}
                value={projection.pendingExpenses}
                currency={user.baseCurrency}
                sign="−"
              />
              <ProjectionLine
                label="Faturas a vencer"
                value={projection.unpaidInvoices}
                currency={user.baseCurrency}
                sign="−"
              />
            </Stack>
            {!projection.complete && (
              <Text size="xs" c="orange" mt="xs">
                Não inclui valores sem cotação para {user.baseCurrency}.
              </Text>
            )}
          </Card>
        </GridCol>

        <GridCol span={{ base: 12, md: 6 }}>
          <Card withBorder radius="md" padding="lg" h="100%">
            <Group justify="space-between" mb="sm">
              <Title order={5}>A confirmar</Title>
              <Badge variant="light" color={pending.length > 0 ? "orange" : "gray"} size="sm">
                {pending.length}
              </Badge>
            </Group>

            {pending.length === 0 ? (
              <EmptyState
                message="Nenhuma pendência até o fim do mês."
                icon={CalendarClock}
              />
            ) : (
              <Stack gap="xs">
                {pending.map((occurrence) => (
                  <Group key={occurrence.id} justify="space-between" wrap="nowrap">
                    <Stack gap={0}>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" fw={500}>
                          {occurrence.description}
                        </Text>
                        {occurrence.isEstimated && (
                          <Badge size="xs" variant="outline" color="blue" tt="none">
                            estimado
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {formatDay(occurrence.date)} · {occurrence.accountName}
                      </Text>
                    </Stack>
                    <Group gap="sm" wrap="nowrap">
                      <Text size="sm" fw={500} c="red">
                        {formatCurrency(occurrence.amount, occurrence.currency)}
                      </Text>
                      <ConfirmPendingButton
                        id={occurrence.id}
                        description={occurrence.description}
                        amount={occurrence.amount}
                        currency={occurrence.currency as CurrencyCode}
                        accountCurrency={occurrence.accountCurrency as CurrencyCode}
                        date={occurrence.date}
                        isEstimated={occurrence.isEstimated}
                        compact
                      />
                    </Group>
                  </Group>
                ))}
              </Stack>
            )}
          </Card>
        </GridCol>
      </Grid>

      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Definições
        </Title>

        {recurrings.length === 0 ? (
          <EmptyState message="Nenhuma recorrência ainda. Cadastre a primeira para projetar seus gastos fixos." />
        ) : (
          <TableScrollContainer minWidth={760}>
            <Table highlightOnHover>
              <TableThead>
                <TableTr>
                  <TableTh w={60}>Ativa</TableTh>
                  <TableTh>Descrição</TableTh>
                  <TableTh>Cobrança</TableTh>
                  <TableTh>Categoria</TableTh>
                  <TableTh>Periodicidade</TableTh>
                  <TableTh ta="right">Valor</TableTh>
                  <TableTh w={80} />
                </TableTr>
              </TableThead>
              <TableTbody>
                {recurrings.map((item) => (
                  <TableTr key={item.id} opacity={item.active ? 1 : 0.55}>
                    <TableTd>
                      <RecurringActiveToggle id={item.id} active={item.active} />
                    </TableTd>
                    <TableTd>
                      <Stack gap={0}>
                        <Group gap="xs" wrap="nowrap">
                          <Text size="sm">{item.description}</Text>
                          {item.isEstimated && (
                            <Badge size="xs" variant="outline" color="blue" tt="none">
                              estimado
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          Desde {formatDay(item.startDate)}
                          {item.endDate ? ` até ${formatDay(item.endDate)}` : ""}
                        </Text>
                      </Stack>
                    </TableTd>
                    <TableTd>
                      <Group gap={6} wrap="nowrap">
                        {item.accountId ? <Wallet size={14} /> : <CreditCard size={14} />}
                        <Text size="sm">{targetLabel(item)}</Text>
                      </Group>
                    </TableTd>
                    <TableTd>
                      <Badge
                        color={item.categoryColor ?? DEFAULT_CATEGORY_COLOR}
                        variant="light"
                      >
                        {item.categoryName}
                      </Badge>
                    </TableTd>
                    <TableTd>
                      <Text size="sm">
                        {FREQUENCY_LABELS[item.frequency]}
                        {item.frequency === "WEEKLY" ? "" : ` · dia ${item.dueDay}`}
                      </Text>
                    </TableTd>
                    <TableTd ta="right">
                      <Text fw={500}>{formatCurrency(item.amount, item.currency)}</Text>
                    </TableTd>
                    <TableTd>
                      <Group justify="flex-end" gap={4} wrap="nowrap">
                        <EditRecurringButton
                          id={item.id}
                          values={toFormValues(item)}
                          accounts={options.accounts}
                          cards={cardOptions}
                          categories={options.categories}
                        />
                        <DeleteRecurringButton id={item.id} description={item.description} />
                      </Group>
                    </TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </TableScrollContainer>
        )}
      </Card>
    </Stack>
  );
}

interface ProjectionLineProps {
  label: string;
  value: number;
  currency: string;
  sign?: "+" | "−";
}

function ProjectionLine(props: ProjectionLineProps) {
  const { label, value, currency, sign } = props;

  return (
    <Group justify="space-between" gap="sm">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="sm">
        {sign ?? ""}
        {formatCurrency(value, currency)}
      </Text>
    </Group>
  );
}
