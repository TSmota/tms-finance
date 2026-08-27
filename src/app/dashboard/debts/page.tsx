import {
  Alert,
  Badge,
  Card,
  Grid,
  GridCol,
  Group,
  Progress,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, TriangleAlert } from "lucide-react";

import { requireUser } from "@/lib/session";
import { listDebts, type DebtListItem } from "@/lib/debts";
import { listPersonOptions } from "@/lib/people";
import { listCreditCardOptions } from "@/lib/creditCards";
import { loadFormOptions } from "@/lib/formOptions";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";
import {
  DEBT_STATUS_COLORS,
  DEBT_STATUS_LABELS,
  DEBT_TYPE_CODES,
  DEBT_TYPE_POSITION,
  type DebtTypeCode,
} from "@/lib/debtTypes";
import { toCalendarDate, formatDay } from "@/lib/dates";
import { AddDebtButton } from "@/components/forms/AddDebtButton";
import { EditDebtButton } from "@/components/forms/EditDebtButton";
import { deleteDebt } from "@/actions/debts";
import { DeleteEntityButton } from "@/components/forms/DeleteEntityButton";
import { SettleDebtButton } from "@/components/forms/SettleDebtButton";
import { LinkButton } from "@/components/ui/AppLink";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { DebtFormValues } from "@/components/forms/DebtFields";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { joinTarget, TARGET_ACCOUNT_PREFIX } from "@/lib/paymentTarget";
import type { CardOption } from "@/lib/options";

interface DebtsPageProps {
  /** `?person=<uuid>` filtra por pessoa, vindo da tela de pessoas. */
  searchParams: Promise<{ person?: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valores iniciais do formulário de edição, a partir da dívida gravada.
 *
 * O destino e a data vêm da **movimentação de origem**, não de um palpite:
 * salvar sem mexer nesses campos precisa deixar o lançamento exatamente onde
 * ele está.
 */
function toFormValues(debt: DebtListItem, fallbackTarget: string): DebtFormValues {
  return {
    personId: debt.personId,
    categoryId: debt.categoryId,
    type: debt.type,
    description: debt.description,
    amount: debt.originalAmount,
    currency: debt.currency,
    target: debt.originTarget
      ? joinTarget(
          debt.originTarget.kind === "account" ? debt.originTarget.id : null,
          debt.originTarget.kind === "card" ? debt.originTarget.id : null,
        )
      : fallbackTarget,
    installments: debt.originInstallments,
    date: toCalendarDate(debt.originDate ?? debt.createdAt),
    dueDate: debt.dueDate ? toCalendarDate(debt.dueDate) : null,
    manualFxRate: undefined,
  };
}

export default async function DebtsPage({ searchParams }: DebtsPageProps) {
  const user = await requireUser();
  const { person } = await searchParams;

  // Id inválido na URL é ignorado, não é erro: `?person=lixo` mostra tudo.
  const personId = person && UUID_PATTERN.test(person) ? person : undefined;

  const [debts, people, options, cards] = await Promise.all([
    listDebts(user.id, { personId }),
    listPersonOptions(user.id),
    loadFormOptions(user.id),
    listCreditCardOptions(user.id),
  ]);

  const filteredPerson = people.find((entry) => entry.value === personId);

  // Os três são obrigatórios no formulário: sem qualquer um deles o botão só
  // abriria um modal impossível de enviar.
  const missing = [
    people.length === 0 ? "uma pessoa" : null,
    options.accounts.length === 0 && cards.length === 0 ? "uma conta ou um cartão" : null,
    options.categories.length === 0 ? "uma categoria" : null,
  ].filter((entry) => entry !== null);

  const addButton = (
    <AddDebtButton
      people={people}
      categories={options.categories}
      accounts={options.accounts}
      cards={cards}
      defaultPersonId={personId}
      baseCurrency={user.baseCurrency}
    />
  );

  return (
    <Stack gap="lg">
      <PageHeader
        title="Dívidas"
        subtitle={
          filteredPerson
            ? `Empréstimos e pendências de ${filteredPerson.label}`
            : "Empréstimos feitos e recebidos, com o motivo de cada um"
        }
        action={missing.length === 0 && addButton}
      />

      {missing.length > 0 && (
        <Alert color="blue" variant="light" icon={<TriangleAlert size={16} />}>
          Para registrar uma dívida você precisa de {missing.join(", ")}.
        </Alert>
      )}

      {filteredPerson && (
        <Group>
          <LinkButton href="/dashboard/debts">Ver todas as pessoas</LinkButton>
        </Group>
      )}

      {debts.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <EmptyState
            message="Nenhuma dívida registrada."
            action={missing.length === 0 ? addButton : undefined}
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
                      cards={cards}
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
  cards: CardOption[];
}

function DebtCard({ debt, people, categories, accounts, cards }: DebtCardProps) {
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
        {debt.originCardName && (
          <Text size="sm" c="dimmed">
            {debt.originCardName}
            {debt.originInstallments > 1 && ` · ${debt.originInstallments}x`}
          </Text>
        )}
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
              currency={debt.currency}
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
            values={toFormValues(
              debt,
              accounts[0] ? `${TARGET_ACCOUNT_PREFIX}${accounts[0].value}` : "",
            )}
            people={people}
            categories={categories}
            accounts={accounts}
            cards={cards}
            type={debt.type}
            currency={debt.currency}
            originLocked={debt.originLocked}
          />
          <Tooltip
            label={debt.originLocked ? "A origem desta dívida está em uma fatura paga" : undefined}
            disabled={!debt.originLocked}
          >
            <span>
              <DeleteEntityButton
                id={debt.id}
                title="Remover dívida"
                successMessage="Dívida removida"
                question={`Remover "${debt.description}" devolve os saldos das contas ao que eram. Tem certeza?`}
                action={deleteDebt}
                impactTarget="debt"
                blocked={debt.originLocked}
                disabled={debt.originLocked}
              />
            </span>
          </Tooltip>
        </Group>
      </Group>
    </Card>
  );
}
