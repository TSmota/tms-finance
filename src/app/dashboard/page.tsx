import {
  Badge,
  Card,
  Grid,
  GridCol,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { requireUser } from "@/lib/session";
import { getAccountBalances } from "@/lib/accounts";
import { listRecentTransactions } from "@/lib/transactions";
import { getDebtsByCategory, getMonthSummary, getOpenInvoices } from "@/lib/reports";
import { getBalanceProjection } from "@/lib/projection";
import { listPendingOccurrences } from "@/lib/recurring";
import { loadFormOptions } from "@/lib/formOptions";
import { currentCompetency } from "@/lib/dates";
import { formatCurrency } from "@/lib/currency";
import { toTransactionRow, type TransactionRow } from "@/lib/transactionRow";
import { MonthlyCharts } from "@/components/MonthlyCharts";
import { CategoryPie } from "@/components/CategoryPie";
import { AddTransactionButton } from "@/components/forms/AddTransactionButton";
import { ConfirmPendingButton } from "@/components/forms/ConfirmPendingButton";
import { LinkButton } from "@/components/ui/AppLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { TransactionsTable } from "@/components/TransactionsTable";

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function formatDay(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default async function DashboardPage() {
  const user = await requireUser();
  const { year, month } = currentCompetency();

  const [balances, recent, summary, projection, openInvoices, debts, pending, options] =
    await Promise.all([
      getAccountBalances(user.id, user.baseCurrency),
      listRecentTransactions(user.id),
      getMonthSummary(user.id, year, month, user.baseCurrency),
      getBalanceProjection(user.id, year, month, user.baseCurrency),
      getOpenInvoices(user.id, user.baseCurrency),
      getDebtsByCategory(user.id, user.baseCurrency),
      listPendingOccurrences(user.id, year, month),
      loadFormOptions(user.id),
    ]);

  const rows: TransactionRow[] = recent.map((transaction) =>
    toTransactionRow(transaction, user.baseCurrency),
  );

  const netPosition = debts.receivableTotal - debts.payableTotal;
  const monthLabel = `${MONTH_NAMES[month - 1]} de ${year}`;
  const partial = `Parcial: falta cotação para ${user.baseCurrency}.`;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Painel"
        subtitle={`Visão geral de ${monthLabel}`}
        action={
          options.accounts.length > 0 && (
            <AddTransactionButton
              accounts={options.accounts}
              categories={options.categories}
              baseCurrency={user.baseCurrency}
            />
          )
        }
      />

      {/* Linha 1: as duas perguntas de saldo — o que tenho e o que sobra. */}
      <Grid>
        <GridCol span={{ base: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Patrimônio líquido"
            value={formatCurrency(balances.netWorth, user.baseCurrency)}
            note={balances.netWorthComplete ? undefined : partial}
            warn={!balances.netWorthComplete}
          />
        </GridCol>
        <GridCol span={{ base: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Saldo projetado"
            hint="Fim do mês, se tudo o que está previsto acontecer"
            value={formatCurrency(projection.projectedBalance, user.baseCurrency)}
            color={projection.projectedBalance < 0 ? "red" : undefined}
            note={projection.complete ? undefined : partial}
            warn={!projection.complete}
          />
        </GridCol>
        <GridCol span={{ base: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Receitas do mês"
            value={formatCurrency(summary.income, user.baseCurrency)}
            color="teal"
          />
        </GridCol>
        <GridCol span={{ base: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Saídas de caixa do mês"
            hint={
              summary.invoicePayments > 0
                ? `Inclui ${formatCurrency(summary.invoicePayments, user.baseCurrency)} de fatura paga`
                : "O que saiu das contas"
            }
            value={formatCurrency(summary.expenses, user.baseCurrency)}
            color="red"
            note={summary.complete ? undefined : partial}
            warn={!summary.complete}
          />
        </GridCol>
      </Grid>

      {/* Linha 2: o que ainda vai sair, e para quem. */}
      <Grid>
        <GridCol span={{ base: 12, md: 4 }}>
          <StatCard
            label="Faturas em aberto"
            hint={
              openInvoices.nextDueDate
                ? `Próximo vencimento em ${formatDay(openInvoices.nextDueDate)}`
                : "Nenhuma fatura em aberto"
            }
            value={formatCurrency(openInvoices.total, user.baseCurrency)}
            badge={openInvoices.count > 0 ? `${openInvoices.count}` : undefined}
            action={<LinkButton href="/dashboard/cards">Cartões</LinkButton>}
            note={openInvoices.complete ? undefined : partial}
            warn={!openInvoices.complete}
          />
        </GridCol>
        <GridCol span={{ base: 12, md: 4 }}>
          <StatCard
            label="Pendências a confirmar"
            hint={
              pending.length === 0
                ? "Nada a confirmar até o fim do mês"
                : `${pending.length} ${pending.length === 1 ? "ocorrência" : "ocorrências"} até o fim do mês`
            }
            value={formatCurrency(projection.pendingExpenses, user.baseCurrency)}
            badge={pending.length > 0 ? String(pending.length) : undefined}
            action={<LinkButton href="/dashboard/recurring">Recorrentes</LinkButton>}
          />
        </GridCol>
        <GridCol span={{ base: 12, md: 4 }}>
          <StatCard
            label="Posição com terceiros"
            hint={
              netPosition >= 0
                ? `${formatCurrency(debts.receivableTotal, user.baseCurrency)} a receber`
                : `${formatCurrency(debts.payableTotal, user.baseCurrency)} a pagar`
            }
            value={formatCurrency(netPosition, user.baseCurrency)}
            color={netPosition < 0 ? "red" : undefined}
            action={<LinkButton href="/dashboard/debts">Dívidas</LinkButton>}
            note={debts.complete ? undefined : partial}
            warn={!debts.complete}
          />
        </GridCol>
      </Grid>

      <MonthlyCharts
        byCategory={summary.byCategory}
        spendingTotal={summary.spendingTotal}
        income={summary.income}
        expenses={summary.expenses}
        cardSpending={summary.cardSpending}
        currency={user.baseCurrency}
      />

      {(debts.receivable.length > 0 || debts.payable.length > 0) && (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {debts.receivable.length > 0 && (
            <Card withBorder radius="md" padding="lg">
              <Stack gap={2} mb="md">
                <Text fw={600}>A receber por motivo</Text>
                <Text size="xs" c="dimmed">
                  Com o que o dinheiro emprestado foi gasto
                </Text>
              </Stack>
              <CategoryPie
                slices={debts.receivable}
                total={debts.receivableTotal}
                currency={user.baseCurrency}
              />
            </Card>
          )}
          {debts.payable.length > 0 && (
            <Card withBorder radius="md" padding="lg">
              <Stack gap={2} mb="md">
                <Text fw={600}>A pagar por motivo</Text>
                <Text size="xs" c="dimmed">
                  O que você pegou emprestado, por origem
                </Text>
              </Stack>
              <CategoryPie
                slices={debts.payable}
                total={debts.payableTotal}
                currency={user.baseCurrency}
              />
            </Card>
          )}
        </SimpleGrid>
      )}

      {pending.length > 0 && (
        <Card withBorder radius="md" padding="lg">
          <Group justify="space-between" mb="md">
            <Title order={2} size="h4">A confirmar neste mês</Title>
            <LinkButton href="/dashboard/recurring" rightSection={<ChevronRight size={14} />}>
              Ver recorrentes
            </LinkButton>
          </Group>
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
                    currency={occurrence.currency}
                    accountCurrency={occurrence.accountCurrency}
                    date={occurrence.date}
                    isEstimated={occurrence.isEstimated}
                    compact
                  />
                </Group>
              </Group>
            ))}
          </Stack>
        </Card>
      )}

      <Card withBorder radius="md" padding="lg">
        <Group justify="space-between" mb="md">
          <Title order={2} size="h4">Atividade recente</Title>
          <LinkButton href="/dashboard/transactions" rightSection={<ChevronRight size={14} />}>
            Todas as transações
          </LinkButton>
        </Group>
        {rows.length === 0 ? (
          <EmptyState message="Nenhum lançamento ainda. Adicione o primeiro para começar." />
        ) : (
          <TransactionsTable
            transactions={rows}
            accounts={options.accounts}
            categories={options.categories}
          />
        )}
      </Card>
    </Stack>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  /** Explicação do que o número significa. Metade dos cards precisa de uma. */
  hint?: string;
  color?: string;
  /** Nota de rodapé; laranja quando `warn`. */
  note?: string;
  warn?: boolean;
  badge?: string;
  action?: ReactNode;
}

function StatCard(props: StatCardProps) {
  const { label, value, hint, color, note, warn, badge, action } = props;

  return (
    <Card withBorder radius="md" padding="lg" h="100%">
      <Stack gap={0} h="100%">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" c="dimmed">
            {label}
          </Text>
          {badge && (
            <Badge variant="light" color="gray" size="sm" tt="none">
              {badge}
            </Badge>
          )}
        </Group>
        <Text fw={700} size="xl" mt="xs" c={color}>
          {value}
        </Text>
        {hint && (
          <Text size="xs" c="dimmed" mt={4}>
            {hint}
          </Text>
        )}
        {note && (
          <Text size="xs" c={warn ? "orange" : "dimmed"} mt={4}>
            {note}
          </Text>
        )}
        {action && <Group mt="auto" pt="sm">{action}</Group>}
      </Stack>
    </Card>
  );
}
