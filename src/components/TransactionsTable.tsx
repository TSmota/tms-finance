"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { ChevronDown, ChevronUp, Search } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { toCalendarDate } from "@/lib/dates";
import { EmptyState } from "@/components/EmptyState";
import { EditTransactionButton } from "@/components/forms/EditTransactionButton";
import { deleteTransaction } from "@/actions/transactions";
import { DeleteEntityButton } from "@/components/forms/DeleteEntityButton";
import { ConfirmPendingButton } from "@/components/forms/ConfirmPendingButton";
import type { AccountOption, Option } from "@/lib/options";
import type { TransactionRow } from "@/lib/transactionRow";
import { CategoryBadge } from "@/components/ui/CategoryBadge";

const MANAGED_BY_LABEL = {
  debt: { label: "Dívida", hint: "Ajuste pela tela de dívidas" },
  invoice: { label: "Fatura", hint: "Desfaça o pagamento pela tela do cartão" },
} as const;

interface TransactionsTableProps {
  transactions: TransactionRow[];
  accounts: AccountOption[];
  categories: Option[];
  emptyMessage?: string;
  /** Botão oferecido quando não há lançamento nenhum. */
  emptyAction?: ReactNode;
}

type SortKey = "date" | "amount";
type SortDir = "asc" | "desc";

/** Tradução de `SortDir` para o vocabulário do `aria-sort`. */
function ariaSort(dir: SortDir): "ascending" | "descending" {
  return dir === "asc" ? "ascending" : "descending";
}

export function TransactionsTable(props: TransactionsTableProps) {
  const {
    transactions,
    accounts,
    categories,
    emptyMessage = "Nenhuma transação ainda. Adicione a primeira para começar.",
    emptyAction,
  } = props;

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    const rows = transactions.filter((transaction) => {
      if (query && !transaction.description.toLowerCase().includes(query)) {
        return false;
      }
      if (categoryId && transaction.categoryId !== categoryId) {
        return false;
      }
      if (accountId && transaction.accountId !== accountId) {
        return false;
      }
      if (type !== "ALL" && transaction.type !== type) {
        return false;
      }
      if (status !== "ALL" && transaction.status !== status) {
        return false;
      }

      return true;
    });

    rows.sort((a, b) => {
      const comparison =
        sortKey === "date"
          ? a.date.getTime() - b.date.getTime()
          : a.convertedAmount - b.convertedAmount;

      return sortDir === "asc" ? comparison : -comparison;
    });

    return rows;
  }, [transactions, search, categoryId, accountId, type, status, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (transactions.length === 0) {
    return <EmptyState message={emptyMessage} action={emptyAction} />;
  }

  const hasPending = transactions.some((transaction) => transaction.status === "PENDING");

  return (
    <>
      {/* `aria-label` em cada controle: a barra não comporta rótulo visível. */}
      <Group mb="md" gap="sm" wrap="wrap" role="search" aria-label="Filtros de transações">
        <TextInput
          placeholder="Buscar descrição"
          aria-label="Buscar por descrição"
          leftSection={<Search size={16} aria-hidden />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          flex={1}
          miw={180}
        />
        <Select
          placeholder="Todas as categorias"
          aria-label="Filtrar por categoria"
          data={categories}
          value={categoryId}
          onChange={setCategoryId}
          clearable
          searchable
          w={200}
        />
        <Select
          placeholder="Todas as contas"
          aria-label="Filtrar por conta"
          data={accounts}
          value={accountId}
          onChange={setAccountId}
          clearable
          w={180}
        />
        <SegmentedControl
          value={type}
          onChange={setType}
          aria-label="Filtrar por tipo"
          data={[
            { value: "ALL", label: "Todos" },
            { value: "INCOME", label: "Receitas" },
            { value: "EXPENSE", label: "Despesas" },
          ]}
        />
        {hasPending && (
          <SegmentedControl
            value={status}
            onChange={setStatus}
            aria-label="Filtrar por situação"
            data={[
              { value: "ALL", label: "Tudo" },
              { value: "CONFIRMED", label: "Confirmados" },
              { value: "PENDING", label: "Pendentes" },
            ]}
          />
        )}
      </Group>

      {/* A filtragem não recarrega a página; sem região viva, ninguém é avisado. */}
      <Text className="visually-hidden" role="status" aria-live="polite">
        {`${filtered.length} ${filtered.length === 1 ? "transação encontrada" : "transações encontradas"}`}
      </Text>

      {filtered.length === 0 ? (
        <EmptyState message="Nenhuma transação corresponde aos filtros." icon={Search} />
      ) : (
        <Table.ScrollContainer minWidth={720}>
          <Table highlightOnHover>
            {/* Oculta: o Card em volta já traz o título na tela. */}
            <caption className="visually-hidden">
              {`Transações, ${filtered.length} de ${transactions.length}, ordenadas por ${
                sortKey === "date" ? "data" : "valor"
              } em ordem ${sortDir === "asc" ? "crescente" : "decrescente"}`}
            </caption>
            <TableThead>
              <TableTr>
                <TableTh scope="col" aria-sort={sortKey === "date" ? ariaSort(sortDir) : "none"}>
                  <SortHeader
                    label="Data"
                    active={sortKey === "date"}
                    dir={sortDir}
                    onClick={() => toggleSort("date")}
                  />
                </TableTh>
                <TableTh scope="col">Descrição</TableTh>
                <TableTh scope="col">Categoria</TableTh>
                <TableTh scope="col">Conta</TableTh>
                <TableTh
                  scope="col"
                  ta="right"
                  aria-sort={sortKey === "amount" ? ariaSort(sortDir) : "none"}
                >
                  <SortHeader
                    label="Valor"
                    active={sortKey === "amount"}
                    dir={sortDir}
                    onClick={() => toggleSort("amount")}
                    align="right"
                  />
                </TableTh>
                <TableTh scope="col" w={140}>
                  <span className="visually-hidden">Ações</span>
                </TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {filtered.map((transaction) => {
                const isConverted = transaction.currency !== transaction.accountCurrency;

                return (
                  <TableTr key={transaction.id}>
                    <TableTd>{transaction.date.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</TableTd>
                    <TableTd>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm">{transaction.description}</Text>
                        {transaction.status === "PENDING" && (
                          <Badge size="xs" variant="outline" color="orange" tt="none">
                            pendente
                          </Badge>
                        )}
                      </Group>
                    </TableTd>
                    <TableTd>
                      {transaction.categoryName ? (
                        <CategoryBadge
                          name={transaction.categoryName}
                          color={transaction.categoryColor}
                        />
                      ) : (
                        <Text c="dimmed" size="sm">
                          —
                        </Text>
                      )}
                    </TableTd>
                    <TableTd>{transaction.accountName}</TableTd>
                    <TableTd ta="right">
                      <Stack gap={0} align="flex-end">
                        <Text
                          c={
                            transaction.status === "PENDING"
                              ? "dimmed"
                              : transaction.type === "INCOME"
                                ? "teal"
                                : "red"
                          }
                          fw={500}
                        >
                          {transaction.type === "INCOME" ? "+" : "-"}
                          {formatCurrency(transaction.convertedAmount, transaction.accountCurrency)}
                        </Text>
                        {isConverted && (
                          <Text size="xs" c="dimmed">
                            {formatCurrency(transaction.amount, transaction.currency)} ×{" "}
                            {transaction.exchangeRate.toLocaleString("pt-BR", {
                              minimumFractionDigits: 4,
                            })}
                          </Text>
                        )}
                      </Stack>
                    </TableTd>
                    <TableTd>
                      <Group justify="flex-end" gap={4} wrap="nowrap">
                        {transaction.managedBy ? (
                          <Tooltip label={MANAGED_BY_LABEL[transaction.managedBy].hint}>
                            <Badge size="sm" variant="light" color="gray" tt="none">
                              {MANAGED_BY_LABEL[transaction.managedBy].label}
                            </Badge>
                          </Tooltip>
                        ) : (
                          <>
                            {transaction.status === "PENDING" && (
                              <ConfirmPendingButton
                                id={transaction.id}
                                description={transaction.description}
                                amount={transaction.amount}
                                currency={transaction.currency}
                                accountCurrency={transaction.accountCurrency}
                                date={transaction.date}
                                isEstimated={transaction.isEstimated}
                                compact
                              />
                            )}
                            <EditTransactionButton
                              id={transaction.id}
                              values={{
                                accountId: transaction.accountId,
                                categoryId: transaction.categoryId ?? "",
                                type: transaction.type,
                                amount: transaction.amount,
                                currency: transaction.currency,
                                date: toCalendarDate(transaction.date),
                                description: transaction.description,
                                manualFxRate: undefined,
                              }}
                              accounts={accounts}
                              categories={categories}
                            />
                            <DeleteEntityButton
                              id={transaction.id}
                              title="Remover transação"
                              successMessage="Transação removida"
                              question={`Tem certeza que deseja remover a transação "${transaction.description}"?`}
                              action={deleteTransaction}
                            />
                          </>
                        )}
                      </Group>
                    </TableTd>
                  </TableTr>
                );
              })}
            </TableTbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </>
  );
}

interface SortHeaderProps {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}

function SortHeader(props: SortHeaderProps) {
  const { label, active, dir, onClick, align = "left" } = props;

  // O `aria-sort` no `<th>` informa o estado; o rótulo aqui, a ação.
  const next = active && dir === "asc" ? "decrescente" : "crescente";

  return (
    <UnstyledButton
      onClick={onClick}
      style={{ display: "inline-flex" }}
      aria-label={`Ordenar por ${label.toLowerCase()}, ordem ${next}`}
    >
      <Group gap={4} wrap="nowrap" justify={align === "right" ? "flex-end" : "flex-start"}>
        <Text size="sm" fw={500} inherit>
          {label}
        </Text>
        {active &&
          (dir === "asc" ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />)}
      </Group>
    </UnstyledButton>
  );
}
