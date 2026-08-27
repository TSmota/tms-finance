import { notFound } from "next/navigation";
import {
  Badge,
  Card,
  Grid,
  GridCol,
  Group,
  Progress,
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

import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/errors";
import { getDebtDetail } from "@/lib/debts";
import { listPersonOptions } from "@/lib/people";
import { loadFormOptions } from "@/lib/formOptions";
import { formatCurrency } from "@/lib/currency";
import {
  DEBT_STATUS_COLORS,
  DEBT_STATUS_LABELS,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_POSITION,
} from "@/lib/debtTypes";
import { toCalendarDate, formatDay } from "@/lib/dates";
import { SettleDebtButton } from "@/components/forms/SettleDebtButton";
import { EditDebtButton } from "@/components/forms/EditDebtButton";
import { deleteSettlement } from "@/actions/debts";
import { DeleteEntityButton } from "@/components/forms/DeleteEntityButton";
import { BackLink } from "@/components/ui/AppLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { CategoryBadge } from "@/components/ui/CategoryBadge";

export default async function DebtDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const { debt, movements } = await getDebtDetail(user.id, id).catch((error) => {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  });

  const [people, options] = await Promise.all([
    listPersonOptions(user.id),
    loadFormOptions(user.id),
  ]);

  const progress =
    debt.originalAmount > 0 ? (debt.settledAmount / debt.originalAmount) * 100 : 0;

  return (
    <Stack gap="lg">
      <BackLink href="/dashboard/debts">Dívidas</BackLink>

      <PageHeader
        title={debt.description}
        subtitle={`${DEBT_TYPE_LABELS[debt.type]} · ${debt.personName} · ${debt.currency}`}
        action={
          <Group gap="sm">
            {debt.status !== "PAID" && (
              <SettleDebtButton
                debtId={debt.id}
                type={debt.type}
                remainingAmount={debt.remainingAmount}
                currency={debt.currency}
                accounts={options.accounts}
                categories={options.categories}
                defaultCategoryId={debt.categoryId}
                defaultAccountId={debt.originAccountId}
              />
            )}
            <EditDebtButton
              id={debt.id}
              values={{
                personId: debt.personId,
                categoryId: debt.categoryId,
                type: debt.type,
                description: debt.description,
                amount: debt.originalAmount,
                currency: debt.currency,
                accountId: debt.originAccountId ?? options.accounts[0]?.value ?? "",
                date: toCalendarDate(debt.originDate ?? debt.createdAt),
                dueDate: debt.dueDate ? toCalendarDate(debt.dueDate) : null,
                manualFxRate: undefined,
              }}
              people={people}
              categories={options.categories}
              accounts={options.accounts}
              type={debt.type}
              currency={debt.currency}
            />
          </Group>
        }
      />

      <Grid>
        <GridCol span={{ base: 12, md: 8 }}>
          <Card withBorder radius="md" padding="lg" h="100%">
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="dimmed">
                {DEBT_TYPE_POSITION[debt.type]}
              </Text>
              <Badge color={DEBT_STATUS_COLORS[debt.status]} variant="light" size="sm">
                {DEBT_STATUS_LABELS[debt.status]}
              </Badge>
            </Group>
            <Text fw={700} size="xl">
              {formatCurrency(debt.remainingAmount, debt.currency)}
            </Text>
            <Progress
              value={progress}
              color={debt.status === "PAID" ? "teal" : "blue"}
              mt="sm"
              mb={4}
              aria-label="Progresso de quitação da dívida"
            />
            <Text size="xs" c="dimmed">
              {formatCurrency(debt.settledAmount, debt.currency)} abatidos de{" "}
              {formatCurrency(debt.originalAmount, debt.currency)}
            </Text>
          </Card>
        </GridCol>
        <GridCol span={{ base: 12, md: 4 }}>
          <Card withBorder radius="md" padding="lg" h="100%">
            <Text size="sm" c="dimmed">
              Motivo
            </Text>
            <CategoryBadge name={debt.categoryName} color={debt.categoryColor} mt="xs" />
            {debt.dueDate && (
              <>
                <Text size="sm" c="dimmed" mt="md">
                  Vencimento
                </Text>
                <Text size="sm">{formatDay(debt.dueDate)}</Text>
              </>
            )}
          </Card>
        </GridCol>
      </Grid>

      <Card withBorder radius="md" padding="lg">
        <Title order={2} size="h4" mb="md">
          Movimentações
        </Title>

        <TableScrollContainer minWidth={640}>
          <Table highlightOnHover>
            <TableThead>
              <TableTr>
                <TableTh>Data</TableTh>
                <TableTh>Descrição</TableTh>
                <TableTh>Categoria</TableTh>
                <TableTh>Conta</TableTh>
                <TableTh ta="right">Valor</TableTh>
                <TableTh w={50} />
              </TableTr>
            </TableThead>
            <TableTbody>
              {movements.map((movement) => {
                const isConverted =
                  movement.accountCurrency !== null &&
                  movement.currency !== movement.accountCurrency;

                return (
                  <TableTr key={movement.id}>
                    <TableTd>{formatDay(movement.date)}</TableTd>
                    <TableTd>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm">{movement.description}</Text>
                        {movement.isOrigin && (
                          <Badge size="xs" variant="outline" color="gray" tt="none">
                            origem
                          </Badge>
                        )}
                      </Group>
                    </TableTd>
                    <TableTd>
                      {movement.categoryName ? (
                        <CategoryBadge
                          name={movement.categoryName}
                          color={movement.categoryColor}
                        />
                      ) : (
                        <Text c="dimmed" size="sm">
                          —
                        </Text>
                      )}
                    </TableTd>
                    <TableTd>{movement.accountName ?? "—"}</TableTd>
                    <TableTd ta="right">
                      <Stack gap={0} align="flex-end">
                        <Text fw={500}>
                          {formatCurrency(
                            movement.convertedAmount,
                            movement.accountCurrency ?? movement.currency,
                          )}
                        </Text>
                        {isConverted && (
                          <Text size="xs" c="dimmed">
                            {formatCurrency(movement.amount, movement.currency)}
                          </Text>
                        )}
                      </Stack>
                    </TableTd>
                    <TableTd>
                      {/* A origem não sai por aqui: apagá-la deixaria a dívida
                          sem o lançamento que a criou. */}
                      {!movement.isOrigin && (
                        <DeleteEntityButton
                          id={movement.id}
                          title="Remover movimentação"
                          successMessage="Movimentação removida"
                          question={`Remover "${movement.description}" devolve o valor ao restante da dívida e reverte o saldo da conta.`}
                          action={deleteSettlement}
                        />
                      )}
                    </TableTd>
                  </TableTr>
                );
              })}
            </TableTbody>
          </Table>
        </TableScrollContainer>
      </Card>
    </Stack>
  );
}
