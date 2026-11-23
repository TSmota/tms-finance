import { notFound } from "next/navigation";
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
  Title,
} from "@mantine/core";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard as CreditCardIcon,
  Landmark,
  Repeat,
  Scale,
  Wallet,
} from "lucide-react";

import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/errors";
import { getAccountDetail } from "@/lib/accounts";
import { resolveCompetency } from "@/lib/competency";
import { loadFormOptions } from "@/lib/formOptions";
import { ACCOUNT_TYPE_LABELS } from "@/lib/accountTypes";
import { formatCurrency } from "@/lib/currency";
import { formatDay } from "@/lib/dates";
import { FREQUENCY_LABELS, type Frequency } from "@/lib/recurrence";
import { MonthSelector } from "@/components/MonthSelector";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackLink, LinkButton } from "@/components/ui/AppLink";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { EmptyState } from "@/components/EmptyState";
import { AddTransactionButton } from "@/components/forms/AddTransactionButton";
import { EditAccountButton } from "@/components/forms/EditAccountButton";
import { DeleteEntityButton } from "@/components/forms/DeleteEntityButton";
import { deleteTransaction } from "@/actions/transactions";
import { deleteTransfer } from "@/actions/transfers";

interface AccountDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}

export default async function AccountDetailPage({
  params,
  searchParams,
}: AccountDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const { month } = await searchParams;
  const competency = resolveCompetency(month);

  const [detail, formOptions] = await Promise.all([
    getAccountDetail(user.id, id, competency.year, competency.month, user.baseCurrency).catch(
      (error) => {
        if (error instanceof NotFoundError) {
          notFound();
        }
        throw error;
      },
    ),
    loadFormOptions(user.id),
  ]);

  return (
    <Stack gap="lg">
      <BackLink href="/dashboard/accounts">Contas e carteiras</BackLink>

      <PageHeader
        title={detail.account.name}
        subtitle={`${ACCOUNT_TYPE_LABELS[detail.account.type] ?? detail.account.type}${detail.account.institution ? ` · ${detail.account.institution}` : ""} · ${detail.account.currency}`}
        action={
          <Group gap="sm">
            <AddTransactionButton
              accounts={formOptions.accounts}
              categories={formOptions.categories}
              baseCurrency={user.baseCurrency}
              defaultAccountId={detail.account.id}
            />
            <EditAccountButton
              id={detail.account.id}
              name={detail.account.name}
              type={detail.account.type}
              institution={detail.account.institution}
              currency={detail.account.currency}
              initialBalance={detail.account.initialBalance}
            />
          </Group>
        }
      />

      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2} size="h5" c="dimmed">
          Métricas da competência
        </Title>
        <MonthSelector />
      </Group>

      <Grid>
        <GridCol span={{ base: 12, sm: 6, md: 4, lg: 2.4 }}>
          <Card className="stat-card stat-card-featured" withBorder radius="md" padding="md" h="100%">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.05em" }}>
                  Saldo atual
                </Text>
                <Text fw={750} size="xl" className="stat-value" mt="xs">
                  {formatCurrency(detail.account.currentBalance, detail.account.currency)}
                </Text>
                {detail.account.currency !== user.baseCurrency && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {detail.account.convertedBalance !== null
                      ? `≈ ${formatCurrency(detail.account.convertedBalance, user.baseCurrency)}`
                      : `Conversão para ${user.baseCurrency} indisponível`}
                  </Text>
                )}
              </div>
              <span className="stat-icon"><Landmark size={18} aria-hidden /></span>
            </Group>
          </Card>
        </GridCol>

        <GridCol span={{ base: 12, sm: 6, md: 4, lg: 2.4 }}>
          <Card className="stat-card" withBorder radius="md" padding="md" h="100%">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.05em" }}>
                  Saldo inicial
                </Text>
                <Text fw={750} size="xl" className="stat-value" mt="xs">
                  {formatCurrency(detail.account.initialBalance, detail.account.currency)}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Definido na criação
                </Text>
              </div>
              <span className="stat-icon"><Wallet size={18} aria-hidden /></span>
            </Group>
          </Card>
        </GridCol>

        <GridCol span={{ base: 12, sm: 6, md: 4, lg: 2.4 }}>
          <Card className="stat-card" withBorder radius="md" padding="md" h="100%">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.05em" }}>
                  Entradas do mês
                </Text>
                <Text fw={750} size="xl" className="stat-value" c="teal" mt="xs">
                  +{formatCurrency(detail.monthSummary.totalIncome, detail.account.currency)}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Receitas e recebimentos
                </Text>
              </div>
              <span className="stat-icon"><ArrowDownLeft size={18} aria-hidden /></span>
            </Group>
          </Card>
        </GridCol>

        <GridCol span={{ base: 12, sm: 6, md: 4, lg: 2.4 }}>
          <Card className="stat-card" withBorder radius="md" padding="md" h="100%">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.05em" }}>
                  Saídas do mês
                </Text>
                <Text fw={750} size="xl" className="stat-value" c="red" mt="xs">
                  -{formatCurrency(detail.monthSummary.totalExpense, detail.account.currency)}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Despesas e envios
                </Text>
              </div>
              <span className="stat-icon"><ArrowUpRight size={18} aria-hidden /></span>
            </Group>
          </Card>
        </GridCol>

        <GridCol span={{ base: 12, sm: 6, md: 4, lg: 2.4 }}>
          <Card className="stat-card" withBorder radius="md" padding="md" h="100%">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.05em" }}>
                  Resultado líquido
                </Text>
                <Text
                  fw={750}
                  size="xl"
                  className="stat-value"
                  c={detail.monthSummary.net >= 0 ? "teal" : "red"}
                  mt="xs"
                >
                  {detail.monthSummary.net >= 0 ? "+" : ""}
                  {formatCurrency(detail.monthSummary.net, detail.account.currency)}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Entradas menos saídas
                </Text>
              </div>
              <span className="stat-icon"><Scale size={18} aria-hidden /></span>
            </Group>
          </Card>
        </GridCol>
      </Grid>

      <Card withBorder radius="md" padding="lg">
        <Group justify="space-between" mb="md" wrap="nowrap">
          <Group gap="xs">
            <Title order={2} size="h4">
              Extrato de movimentações
            </Title>
            <Badge variant="light" color="gray" size="sm">
              {detail.statement.length}
            </Badge>
          </Group>
        </Group>

        {detail.statement.length === 0 ? (
          <EmptyState
            message="Nenhuma movimentação registrada nesta conta neste mês."
            action={
              <AddTransactionButton
                accounts={formOptions.accounts}
                categories={formOptions.categories}
                baseCurrency={user.baseCurrency}
                defaultAccountId={detail.account.id}
              />
            }
          />
        ) : (
          <TableScrollContainer minWidth={600}>
            <Table verticalSpacing="sm" highlightOnHover>
              <TableThead>
                <TableTr>
                  <TableTh w={110}>Data</TableTh>
                  <TableTh>Descrição</TableTh>
                  <TableTh>Categoria / Origem-Destino</TableTh>
                  <TableTh ta="right">Valor</TableTh>
                  <TableTh w={60} />
                </TableTr>
              </TableThead>
              <TableTbody>
                {detail.statement.map((item) => {
                  const isIncome = item.type === "INCOME";
                  const isTransfer = item.kind === "TRANSFER_IN" || item.kind === "TRANSFER_OUT";

                  return (
                    <TableTr key={item.id}>
                      <TableTd>{formatDay(item.date)}</TableTd>
                      <TableTd>
                        <Group gap="xs" wrap="nowrap">
                          <Text fw={500} size="sm">
                            {item.description}
                          </Text>
                          {item.creditCardName && (
                            <Badge size="xs" variant="light" color="blue" tt="none">
                              Fatura {item.creditCardName}
                            </Badge>
                          )}
                          {item.debtDescription && (
                            <Badge size="xs" variant="light" color="grape" tt="none">
                              Dívida: {item.debtDescription}
                            </Badge>
                          )}
                        </Group>
                      </TableTd>
                      <TableTd>
                        {isTransfer ? (
                          <Badge
                            size="sm"
                            variant="light"
                            color={item.kind === "TRANSFER_IN" ? "teal" : "orange"}
                            tt="none"
                          >
                            {item.kind === "TRANSFER_IN"
                              ? `Recebido de ${item.counterpartAccountName ?? "outra conta"}`
                              : `Enviado para ${item.counterpartAccountName ?? "outra conta"}`}
                          </Badge>
                        ) : item.categoryName ? (
                          <CategoryBadge
                            name={item.categoryName}
                            color={item.categoryColor ?? null}
                          />
                        ) : (
                          <Text c="dimmed" size="sm">
                            —
                          </Text>
                        )}
                      </TableTd>
                      <TableTd ta="right">
                        <Text fw={600} size="sm" c={isIncome ? "teal" : "red"}>
                          {isIncome ? "+" : "-"}
                          {formatCurrency(item.amount, item.currency)}
                        </Text>
                      </TableTd>
                      <TableTd ta="center">
                        <DeleteEntityButton
                          id={item.id}
                          title={isTransfer ? "Remover transferência" : "Remover transação"}
                          successMessage={
                            isTransfer ? "Transferência removida" : "Transação removida"
                          }
                          question={
                            isTransfer
                              ? `Remover a transferência "${item.description}"? Os saldos das contas envolvidas serão recalculados.`
                              : `Remover "${item.description}"?`
                          }
                          action={isTransfer ? deleteTransfer : deleteTransaction}
                        />
                      </TableTd>
                    </TableTr>
                  );
                })}
              </TableTbody>
            </Table>
          </TableScrollContainer>
        )}
      </Card>

      {(detail.linkedCreditCards.length > 0 || detail.linkedRecurringExpenses.length > 0) && (
        <Stack gap="md">
          <Title order={2} size="h5" c="dimmed">
            Serviços e vínculos associados
          </Title>

          <Grid>
            {detail.linkedCreditCards.map((card) => (
              <GridCol key={card.id} span={{ base: 12, sm: 6 }}>
                <Card withBorder radius="md" padding="md">
                  <Group justify="space-between" mb="xs" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                      <CreditCardIcon size={18} color="var(--mantine-color-teal-6)" />
                      <Text fw={600}>{card.name}</Text>
                    </Group>
                    <Badge variant="light" color="teal" size="sm" tt="none">
                      Fecha dia {card.closingDay} · vence dia {card.dueDay}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    Débito padrão configurado para esta conta
                  </Text>
                  {card.creditLimit !== null && (
                    <Text size="xs" c="dimmed" mt={4}>
                      Limite: {formatCurrency(card.creditLimit, card.currency)}
                    </Text>
                  )}
                  <Group justify="flex-end" mt="sm">
                    <LinkButton href={`/dashboard/cards/${card.id}`}>
                      Ver cartão
                    </LinkButton>
                  </Group>
                </Card>
              </GridCol>
            ))}

            {detail.linkedRecurringExpenses.map((rec) => (
              <GridCol key={rec.id} span={{ base: 12, sm: 6 }}>
                <Card withBorder radius="md" padding="md">
                  <Group justify="space-between" mb="xs" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                      <Repeat size={18} color="var(--mantine-color-blue-6)" />
                      <Text fw={600}>{rec.description}</Text>
                    </Group>
                    <Badge variant="light" color="blue" size="sm" tt="none">
                      {FREQUENCY_LABELS[rec.frequency as Frequency] ?? rec.frequency}
                    </Badge>
                  </Group>
                  <Text fw={700} size="lg" className="stat-value" mt="xs">
                    {formatCurrency(rec.amount, rec.currency)}
                  </Text>
                  <Text size="xs" c="dimmed" mt={2}>
                    Despesa recorrente ativa debitada nesta conta
                  </Text>
                </Card>
              </GridCol>
            ))}
          </Grid>
        </Stack>
      )}
    </Stack>
  );
}
