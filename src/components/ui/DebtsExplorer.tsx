"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Card,
  Grid,
  GridCol,
  Group,
  Pagination,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  HandCoins,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import type { DebtListItem } from "@/lib/debts";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";
import {
  DEBT_STATUS_COLORS,
  DEBT_STATUS_LABELS,
  DEBT_TYPE_LABELS,
} from "@/lib/debtTypes";
import { formatDay } from "@/lib/dates";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { LinkButton } from "@/components/ui/AppLink";
import { SettleDebtButton } from "@/components/forms/SettleDebtButton";
import { EditDebtButton } from "@/components/forms/EditDebtButton";
import { DeleteEntityButton } from "@/components/forms/DeleteEntityButton";
import { deleteDebt } from "@/actions/debts";
import { toDebtFormValues } from "@/components/forms/debtFormValues";
import { EmptyState } from "@/components/EmptyState";
import type { CardOption } from "@/lib/options";

interface DebtsExplorerProps {
  debts: DebtListItem[];
  people: Array<{ value: string; label: string }>;
  categories: Array<{ value: string; label: string }>;
  accounts: Array<{ value: string; label: string; currency: CurrencyCode }>;
  cards: CardOption[];
  initialPersonId?: string;
}

export function DebtsExplorer(props: DebtsExplorerProps) {
  const { debts, people, categories, accounts, cards, initialPersonId } = props;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "PAID" | "ALL">("OPEN");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "LENT" | "BORROWED">("ALL");
  const [personFilter, setPersonFilter] = useState<string>(initialPersonId ?? "ALL");
  const [sortBy, setSortBy] = useState<string>("due_asc");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [page, setPage] = useState(1);
  const pageSize = viewMode === "cards" ? 10 : 15;

  const personOptions = useMemo(
    () => [{ value: "ALL", label: "Todas as pessoas" }, ...people],
    [people],
  );

  // Totais rápidos de cabeçalho
  const metrics = useMemo(() => {
    let openLentCount = 0;
    let openBorrowedCount = 0;
    let paidCount = 0;

    for (const debt of debts) {
      if (debt.status === "PAID") {
        paidCount += 1;
      } else if (debt.type === "LENT") {
        openLentCount += 1;
      } else {
        openBorrowedCount += 1;
      }
    }

    return {
      openLentCount,
      openBorrowedCount,
      paidCount,
      totalCount: debts.length,
    };
  }, [debts]);

  // Filtragem e ordenação
  const filteredDebts = useMemo(() => {
    const q = search.trim().toLowerCase();

    const result = debts.filter((debt) => {
      // Filtro de status
      if (statusFilter === "OPEN" && debt.status === "PAID") {
        return false;
      }
      if (statusFilter === "PAID" && debt.status !== "PAID") {
        return false;
      }

      // Filtro de tipo
      if (typeFilter !== "ALL" && debt.type !== typeFilter) {
        return false;
      }

      // Filtro de pessoa
      if (personFilter !== "ALL" && debt.personId !== personFilter) {
        return false;
      }

      // Filtro de busca textual
      if (q) {
        const matchesDesc = debt.description.toLowerCase().includes(q);
        const matchesPerson = debt.personName.toLowerCase().includes(q);
        const matchesCat = debt.categoryName.toLowerCase().includes(q);
        if (!matchesDesc && !matchesPerson && !matchesCat) {
          return false;
        }
      }

      return true;
    });

    // Ordenação
    result.sort((a, b) => {
      if (sortBy === "due_asc") {
        if (!a.dueDate && !b.dueDate) {
          return 0;
        }
        if (!a.dueDate) {
          return 1;
        }
        if (!b.dueDate) {
          return -1;
        }
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (sortBy === "remaining_desc") {
        return b.remainingAmount - a.remainingAmount;
      }
      if (sortBy === "person") {
        return a.personName.localeCompare(b.personName);
      }
      // default: recent
      return 0;
    });

    return result;
  }, [debts, search, statusFilter, typeFilter, personFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredDebts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedDebts = filteredDebts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const hasActiveFilters =
    search !== "" || statusFilter !== "OPEN" || typeFilter !== "ALL" || personFilter !== "ALL";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("OPEN");
    setTypeFilter("ALL");
    setPersonFilter("ALL");
    setPage(1);
  };

  return (
    <Stack gap="md">
      {/* Cards de Métricas e Resumo */}
      <Grid>
        <GridCol span={{ base: 12, sm: 4 }}>
          <Card withBorder radius="md" padding="md">
            <Group justify="space-between" align="center">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  A receber (Empréstimos)
                </Text>
                <Text fw={700} size="xl" c="teal" mt={4}>
                  {metrics.openLentCount}{" "}
                  <Text component="span" size="sm" c="dimmed" fw={500}>
                    {metrics.openLentCount === 1 ? "em aberto" : "em aberto"}
                  </Text>
                </Text>
              </div>
              <ArrowUpRight size={24} color="var(--mantine-color-teal-6)" />
            </Group>
          </Card>
        </GridCol>
        <GridCol span={{ base: 12, sm: 4 }}>
          <Card withBorder radius="md" padding="md">
            <Group justify="space-between" align="center">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  A pagar (Dívidas)
                </Text>
                <Text fw={700} size="xl" c="red" mt={4}>
                  {metrics.openBorrowedCount}{" "}
                  <Text component="span" size="sm" c="dimmed" fw={500}>
                    {metrics.openBorrowedCount === 1 ? "em aberto" : "em aberto"}
                  </Text>
                </Text>
              </div>
              <ArrowDownLeft size={24} color="var(--mantine-color-red-6)" />
            </Group>
          </Card>
        </GridCol>
        <GridCol span={{ base: 12, sm: 4 }}>
          <Card withBorder radius="md" padding="md">
            <Group justify="space-between" align="center">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Histórico Quitado
                </Text>
                <Text fw={700} size="xl" c="blue" mt={4}>
                  {metrics.paidCount}{" "}
                  <Text component="span" size="sm" c="dimmed" fw={500}>
                    {metrics.paidCount === 1 ? "quitada" : "quitadas"}
                  </Text>
                </Text>
              </div>
              <HandCoins size={24} color="var(--mantine-color-blue-6)" />
            </Group>
          </Card>
        </GridCol>
      </Grid>

      {/* Barra de Filtros e Busca */}
      <Card withBorder radius="md" padding="md">
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <SegmentedControl
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val as "OPEN" | "PAID" | "ALL");
                setPage(1);
              }}
              data={[
                { value: "OPEN", label: `Em aberto (${metrics.openLentCount + metrics.openBorrowedCount})` },
                { value: "PAID", label: `Quitadas (${metrics.paidCount})` },
                { value: "ALL", label: `Todas (${metrics.totalCount})` },
              ]}
              size="sm"
            />

            <Group gap="xs">
              <SegmentedControl
                value={typeFilter}
                onChange={(val) => {
                  setTypeFilter(val as "ALL" | "LENT" | "BORROWED");
                  setPage(1);
                }}
                data={[
                  { value: "ALL", label: "Todos os tipos" },
                  { value: "LENT", label: "Emprestei" },
                  { value: "BORROWED", label: "Peguei emprestado" },
                ]}
                size="xs"
              />

              <SegmentedControl
                value={viewMode}
                onChange={(val) => setViewMode(val as "cards" | "table")}
                data={[
                  {
                    value: "cards",
                    label: (
                      <Group gap={4} wrap="nowrap">
                        <LayoutGrid size={14} />
                        <span>Cards</span>
                      </Group>
                    ),
                  },
                  {
                    value: "table",
                    label: (
                      <Group gap={4} wrap="nowrap">
                        <List size={14} />
                        <span>Tabela</span>
                      </Group>
                    ),
                  },
                ]}
                size="xs"
              />
            </Group>
          </Group>

          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <TextInput
              placeholder="Buscar por descrição, pessoa ou categoria..."
              leftSection={<Search size={15} color="var(--mantine-color-dimmed)" aria-hidden />}
              value={search}
              onChange={(e) => {
                setSearch(e.currentTarget.value);
                setPage(1);
              }}
              size="sm"
              style={{ flex: 1, minWidth: 260 }}
              rightSection={
                search ? (
                  <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setSearch("")}>
                    <X size={14} />
                  </ActionIcon>
                ) : undefined
              }
            />

            <Group gap="xs" wrap="wrap">
              <Select
                placeholder="Pessoa"
                data={personOptions}
                value={personFilter}
                onChange={(val) => {
                  setPersonFilter(val ?? "ALL");
                  setPage(1);
                }}
                size="sm"
                searchable
                style={{ width: 190 }}
                aria-label="Filtrar por pessoa"
              />

              <Select
                placeholder="Ordenar por"
                data={[
                  { value: "due_asc", label: "Vencimento (mais próximos)" },
                  { value: "remaining_desc", label: "Maior saldo restante" },
                  { value: "recent", label: "Mais recentes" },
                  { value: "person", label: "Nome da pessoa (A-Z)" },
                ]}
                value={sortBy}
                onChange={(val) => setSortBy(val ?? "due_asc")}
                size="sm"
                style={{ width: 220 }}
                leftSection={<SlidersHorizontal size={14} color="var(--mantine-color-dimmed)" aria-hidden />}
                aria-label="Ordenar dívidas"
              />

              {hasActiveFilters && (
                <ActionIcon
                  variant="light"
                  color="gray"
                  size="input-sm"
                  onClick={clearFilters}
                  title="Limpar filtros"
                  aria-label="Limpar filtros"
                >
                  <X size={16} />
                </ActionIcon>
              )}
            </Group>
          </Group>
        </Stack>
      </Card>

      {/* Conteúdo: Lista Filtrada */}
      {filteredDebts.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <EmptyState
            message={
              hasActiveFilters
                ? "Nenhuma dívida corresponde aos filtros selecionados."
                : "Nenhuma dívida cadastrada."
            }
          />
        </Card>
      ) : viewMode === "cards" ? (
        <Stack gap="md">
          <Grid>
            {paginatedDebts.map((debt) => (
              <GridCol key={debt.id} span={{ base: 12, md: 6 }}>
                <DebtCard
                  debt={debt}
                  people={people}
                  categories={categories}
                  accounts={accounts}
                  cards={cards}
                />
              </GridCol>
            ))}
          </Grid>

          {totalPages > 1 && (
            <Group justify="space-between" align="center" mt="sm">
              <Text size="xs" c="dimmed">
                Mostrando {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filteredDebts.length)} de {filteredDebts.length}{" "}
                dívidas
              </Text>
              <Pagination
                total={totalPages}
                value={currentPage}
                onChange={setPage}
                color="teal"
                size="sm"
              />
            </Group>
          )}
        </Stack>
      ) : (
        <Card withBorder radius="md" padding="md">
          <TableScrollContainer minWidth={840}>
            <Table highlightOnHover verticalSpacing="xs">
              <TableThead>
                <TableTr>
                  <TableTh>Tipo</TableTh>
                  <TableTh>Pessoa</TableTh>
                  <TableTh>Descrição / Categoria</TableTh>
                  <TableTh>Vencimento</TableTh>
                  <TableTh ta="right">Restante</TableTh>
                  <TableTh ta="right">Amortizado / Total</TableTh>
                  <TableTh>Status</TableTh>
                  <TableTh w={130} ta="right">
                    Ações
                  </TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {paginatedDebts.map((debt) => {
                  const progress =
                    debt.originalAmount > 0
                      ? (debt.settledAmount / debt.originalAmount) * 100
                      : 0;

                  return (
                    <TableTr key={debt.id}>
                      <TableTd>
                        <Badge
                          size="xs"
                          variant="light"
                          color={debt.type === "LENT" ? "teal" : "red"}
                          leftSection={
                            debt.type === "LENT" ? (
                              <ArrowUpRight size={12} />
                            ) : (
                              <ArrowDownLeft size={12} />
                            )
                          }
                        >
                          {debt.type === "LENT" ? "A receber" : "A pagar"}
                        </Badge>
                      </TableTd>
                      <TableTd>
                        <Text size="sm" fw={600}>
                          {debt.personName}
                        </Text>
                      </TableTd>
                      <TableTd>
                        <Stack gap={2}>
                          <Text size="xs" fw={500}>
                            {debt.description}
                          </Text>
                          <Group gap={6} wrap="nowrap">
                            <CategoryBadge name={debt.categoryName} color={debt.categoryColor} />
                            {debt.originCardName && (
                              <Text size="xs" c="dimmed">
                                {debt.originCardName}
                                {debt.originInstallments > 1 && ` (${debt.originInstallments}x)`}
                              </Text>
                            )}
                          </Group>
                        </Stack>
                      </TableTd>
                      <TableTd>
                        {debt.dueDate ? (
                          <Text size="xs" c="dimmed">
                            {formatDay(debt.dueDate)}
                          </Text>
                        ) : (
                          <Text size="xs" c="dimmed">
                            —
                          </Text>
                        )}
                      </TableTd>
                      <TableTd ta="right">
                        <Text
                          size="sm"
                          fw={700}
                          c={debt.status === "PAID" ? "dimmed" : undefined}
                        >
                          {formatCurrency(debt.remainingAmount, debt.currency)}
                        </Text>
                      </TableTd>
                      <TableTd ta="right">
                        <Stack gap={2} align="flex-end">
                          <Text size="xs" c="dimmed">
                            {formatCurrency(debt.settledAmount, debt.currency)} de{" "}
                            {formatCurrency(debt.originalAmount, debt.currency)}
                          </Text>
                          <Progress
                            value={progress}
                            color={debt.status === "PAID" ? "teal" : "blue"}
                            size="xs"
                            w={90}
                            aria-label={`Progresso de quitação: ${Math.round(progress)}%`}
                          />
                        </Stack>
                      </TableTd>
                      <TableTd>
                        <Badge
                          color={DEBT_STATUS_COLORS[debt.status]}
                          variant="light"
                          size="sm"
                        >
                          {DEBT_STATUS_LABELS[debt.status]}
                        </Badge>
                      </TableTd>
                      <TableTd>
                        <Group justify="flex-end" gap={4} wrap="nowrap">
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
                          <LinkButton
                            href={`/dashboard/debts/${debt.id}`}
                            rightSection={<ChevronRight size={13} />}
                          >
                            Ver
                          </LinkButton>
                          <EditDebtButton
                            id={debt.id}
                            values={toDebtFormValues(debt, accounts)}
                            people={people}
                            categories={categories}
                            accounts={accounts}
                            cards={cards}
                            type={debt.type}
                            currency={debt.currency}
                            originLocked={debt.originLocked}
                          />
                          <Tooltip
                            label={
                              debt.originLocked
                                ? "A origem desta dívida está em uma fatura paga"
                                : undefined
                            }
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
                      </TableTd>
                    </TableTr>
                  );
                })}
              </TableTbody>
            </Table>
          </TableScrollContainer>

          {totalPages > 1 && (
            <Group justify="space-between" align="center" mt="md">
              <Text size="xs" c="dimmed">
                Mostrando {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filteredDebts.length)} de {filteredDebts.length}{" "}
                dívidas
              </Text>
              <Pagination
                total={totalPages}
                value={currentPage}
                onChange={setPage}
                color="teal"
                size="sm"
              />
            </Group>
          )}
        </Card>
      )}
    </Stack>
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
        <Group gap="xs" wrap="nowrap">
          <Badge
            size="xs"
            variant="light"
            color={debt.type === "LENT" ? "teal" : "red"}
          >
            {DEBT_TYPE_LABELS[debt.type]}
          </Badge>
          <Badge color={DEBT_STATUS_COLORS[debt.status]} variant="light" size="sm">
            {DEBT_STATUS_LABELS[debt.status]}
          </Badge>
        </Group>
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
            values={toDebtFormValues(debt, accounts)}
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
