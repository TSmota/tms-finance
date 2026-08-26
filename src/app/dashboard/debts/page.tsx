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
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react";

import { requireUser } from "@/lib/session";
import { listDebts, type DebtListItem } from "@/lib/debts";
import { listPersonOptions } from "@/lib/people";
import { loadFormOptions } from "@/lib/formOptions";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";
import {
  DEBT_STATUS_COLORS,
  DEBT_STATUS_LABELS,
  DEBT_TYPE_CODES,
  DEBT_TYPE_POSITION,
  type DebtTypeCode,
} from "@/lib/debtTypes";
import { toCalendarDate } from "@/lib/dates";
import { AddDebtButton } from "@/components/forms/AddDebtButton";
import { EditDebtButton } from "@/components/forms/EditDebtButton";
import { DeleteDebtButton } from "@/components/forms/DeleteDebtButton";
import { SettleDebtButton } from "@/components/forms/SettleDebtButton";
import { LinkButton } from "@/components/ui/AppLink";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { DebtFormValues } from "@/components/forms/DebtFields";
import { CategoryBadge } from "@/components/ui/CategoryBadge";

interface DebtsPageProps {
  /** `?person=<uuid>` filtra por pessoa, vindo da tela de pessoas. */
  searchParams: Promise<{ person?: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDay(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * Valores iniciais do formulário de edição, a partir da dívida gravada.
 *
 * Conta e data vêm da **movimentação de origem**, não de um palpite: salvar sem
 * mexer nesses campos precisa deixar o lançamento exatamente onde ele está.
 */
function toFormValues(debt: DebtListItem, fallbackAccountId: string): DebtFormValues {
  return {
    personId: debt.personId,
    categoryId: debt.categoryId,
    type: debt.type,
    description: debt.description,
    amount: debt.originalAmount,
    currency: debt.currency,
    accountId: debt.originAccountId ?? fallbackAccountId,
    date: toCalendarDate(debt.originDate ?? debt.createdAt),
    dueDate: debt.dueDate ? toCalendarDate(debt.dueDate) : "",
    manualFxRate: undefined,
  };
}

export default async function DebtsPage({ searchParams }: DebtsPageProps) {
  const user = await requireUser();
  const { person } = await searchParams;

  // Id inválido na URL é ignorado, não é erro: `?person=lixo` mostra tudo.
  const personId = person && UUID_PATTERN.test(person) ? person : undefined;

  const [debts, people, options] = await Promise.all([
    listDebts(user.id, { personId }),
    listPersonOptions(user.id),
    loadFormOptions(user.id),
  ]);

  const filteredPerson = people.find((entry) => entry.value === personId);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Dívidas"
        subtitle={
          filteredPerson
            ? `Empréstimos e pendências de ${filteredPerson.label}`
            : "Empréstimos feitos e recebidos, com o motivo de cada um"
        }
        action={
          <AddDebtButton
            people={people}
            categories={options.categories}
            accounts={options.accounts}
            defaultPersonId={personId}
            baseCurrency={user.baseCurrency}
          />
        }
      />

      {filteredPerson && (
        <Group>
          <LinkButton href="/dashboard/debts">Ver todas as pessoas</LinkButton>
        </Group>
      )}

      {debts.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <EmptyState
            message={
              people.length === 0
                ? "Cadastre uma pessoa em Pessoas antes de registrar uma dívida."
                : "Nenhuma dívida registrada."
            }
          />
        </Card>
      ) : (
        DEBT_TYPE_CODES.map((type) => {
          const items = debts.filter((debt) => debt.type === type);

          if (items.length === 0) {
            return null;
          }

          return (
            <Stack key={type} gap="xs">
              <Group gap="xs">
                <TypeIcon type={type} />
                <Title order={2} size="h5" c="dimmed">
                  {DEBT_TYPE_POSITION[type]}
                </Title>
                <Badge variant="light" color="gray" size="sm">
                  {items.length}
                </Badge>
              </Group>

              <Grid>
                {items.map((debt) => (
                  <GridCol key={debt.id} span={{ base: 12, md: 6 }}>
                    <DebtCard
                      debt={debt}
                      people={people}
                      categories={options.categories}
                      accounts={options.accounts}
                    />
                  </GridCol>
                ))}
              </Grid>
            </Stack>
          );
        })
      )}
    </Stack>
  );
}

function TypeIcon({ type }: { type: DebtTypeCode }) {
  const color = "var(--mantine-color-dimmed)";

  return type === "LENT" ? (
    <ArrowUpRight size={16} color={color} />
  ) : (
    <ArrowDownLeft size={16} color={color} />
  );
}

interface DebtCardProps {
  debt: DebtListItem;
  people: Array<{ value: string; label: string }>;
  categories: Array<{ value: string; label: string }>;
  accounts: Array<{ value: string; label: string; currency: CurrencyCode }>;
}

function DebtCard({ debt, people, categories, accounts }: DebtCardProps) {
  const progress =
    debt.originalAmount > 0 ? (debt.settledAmount / debt.originalAmount) * 100 : 0;

  return (
    <Card withBorder radius="md" padding="lg" h="100%">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Stack gap={0}>
          <Text fw={600}>{debt.personName}</Text>
          <Text size="sm" c="dimmed">
            {debt.description}
          </Text>
        </Stack>
        <Badge color={DEBT_STATUS_COLORS[debt.status]} variant="light" size="sm">
          {DEBT_STATUS_LABELS[debt.status]}
        </Badge>
      </Group>

      <Group gap="xs" mb="sm">
        <CategoryBadge name={debt.categoryName} color={debt.categoryColor} />
        {debt.dueDate && (
          <Text size="xs" c="dimmed">
            vence {formatDay(debt.dueDate)}
          </Text>
        )}
      </Group>

      <Text size="sm" c="dimmed">
        Restante
      </Text>
      <Text fw={700} size="lg">
        {formatCurrency(debt.remainingAmount, debt.currency)}
      </Text>

      <Progress
        value={progress}
        color={debt.status === "PAID" ? "teal" : "blue"}
        mt="sm"
        mb={4}
        aria-label={`Quitação de ${debt.personName}`}
      />
      <Text size="xs" c="dimmed">
        {formatCurrency(debt.settledAmount, debt.currency)} de{" "}
        {formatCurrency(debt.originalAmount, debt.currency)}
        {debt.settlementCount > 0 &&
          ` · ${debt.settlementCount} ${debt.settlementCount === 1 ? "movimentação" : "movimentações"}`}
      </Text>

      <Group justify="space-between" mt="md" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <LinkButton
            href={`/dashboard/debts/${debt.id}`}
            rightSection={<ChevronRight size={14} />}
          >
            Histórico
          </LinkButton>
          {debt.status !== "PAID" && (
            <SettleDebtButton
              debtId={debt.id}
              type={debt.type}
              remainingAmount={debt.remainingAmount}
              currency={debt.currency as CurrencyCode}
              accounts={accounts}
              categories={categories}
              defaultCategoryId={debt.categoryId}
              defaultAccountId={debt.originAccountId}
            />
          )}
        </Group>
        <Group gap={4} wrap="nowrap">
          <EditDebtButton
            id={debt.id}
            values={toFormValues(debt, accounts[0]?.value ?? "")}
            people={people}
            categories={categories}
            accounts={accounts}
            type={debt.type}
            currency={debt.currency as CurrencyCode}
          />
          <DeleteDebtButton
            id={debt.id}
            description={debt.description}
            settlementCount={debt.settlementCount}
          />
        </Group>
      </Group>
    </Card>
  );
}
