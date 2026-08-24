"use client";

import { useMemo, useState } from "react";
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
  UnstyledButton,
} from "@mantine/core";
import { ChevronDown, ChevronUp, Search } from "lucide-react";

import { DEFAULT_CATEGORY_COLOR, formatCurrency, type CurrencyCode } from "@/lib/currency";
import { toCalendarDate } from "@/lib/dates";
import { EmptyState } from "@/components/EmptyState";
import { EditTransactionButton } from "@/components/forms/EditTransactionButton";
import { DeleteTransactionButton } from "@/components/forms/DeleteTransactionButton";
import { ConfirmPendingButton } from "@/components/forms/ConfirmPendingButton";
import type { AccountOption, Option } from "@/components/forms/options";

export interface TransactionRow {
  id: string;
  date: Date;
  description: string;
  type: "INCOME" | "EXPENSE";
  /**
   * `PENDING` = ocorrência de recorrente ainda não confirmada. Está
   * fora do saldo e da projeção de receitas/despesas do mês.
   */
  status: "PENDING" | "CONFIRMED";
  /** Valor na moeda do lançamento. */
  amount: number;
  currency: CurrencyCode;
  /** Valor na moeda da conta — o que efetivamente moveu o saldo. */
  convertedAmount: number;
  exchangeRate: number;
  accountId: string;
  accountName: string;
  accountCurrency: CurrencyCode;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  /** Recorrente de valor estimado: a confirmação pede conferência. */
  isEstimated: boolean;
}

interface TransactionsTableProps {
  transactions: TransactionRow[];
  accounts: AccountOption[];
  categories: Option[];
  emptyMessage?: string;
}

type SortKey = "date" | "amount";
type SortDir = "asc" | "desc";

export function TransactionsTable(props: TransactionsTableProps) {
  const {
    transactions,
    accounts,
    categories,
    emptyMessage = "Nenhuma transação ainda. Adicione a primeira para começar.",
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
    return <EmptyState message={emptyMessage} />;
  }

  const hasPending = transactions.some((transaction) => transaction.status === "PENDING");

  return (
    <>
      <Group mb="md" gap="sm" wrap="wrap">
        <TextInput
          placeholder="Buscar descrição"
          leftSection={<Search size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          flex={1}
          miw={180}
        />
        <Select
          placeholder="Todas as categorias"
          data={categories}
          value={categoryId}
          onChange={setCategoryId}
          clearable
          searchable
          w={200}
        />
        <Select
          placeholder="Todas as contas"
          data={accounts}
          value={accountId}
          onChange={setAccountId}
          clearable
          w={180}
        />
        <SegmentedControl
          value={type}
          onChange={setType}
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
            data={[
              { value: "ALL", label: "Tudo" },
              { value: "CONFIRMED", label: "Confirmados" },
              { value: "PENDING", label: "Pendentes" },
            ]}
          />
        )}
      </Group>

      {filtered.length === 0 ? (
        <EmptyState message="Nenhuma transação corresponde aos filtros." icon={Search} />
      ) : (
        <Table.ScrollContainer minWidth={720}>
          <Table highlightOnHover>
            <TableThead>
              <TableTr>
                <TableTh>
                  <SortHeader
                    label="Data"
                    active={sortKey === "date"}
                    dir={sortDir}
                    onClick={() => toggleSort("date")}
                  />
                </TableTh>
                <TableTh>Descrição</TableTh>
                <TableTh>Categoria</TableTh>
                <TableTh>Conta</TableTh>
                <TableTh ta="right">
                  <SortHeader
                    label="Valor"
                    active={sortKey === "amount"}
                    dir={sortDir}
                    onClick={() => toggleSort("amount")}
                    align="right"
                  />
                </TableTh>
                <TableTh w={140} />
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
                        <Badge
                          color={transaction.categoryColor ?? DEFAULT_CATEGORY_COLOR}
                          variant="light"
                        >
                          {transaction.categoryName}
                        </Badge>
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
                        <DeleteTransactionButton
                          id={transaction.id}
                          description={transaction.description}
                        />
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

  return (
    <UnstyledButton onClick={onClick} style={{ display: "inline-flex" }}>
      <Group gap={4} wrap="nowrap" justify={align === "right" ? "flex-end" : "flex-start"}>
        <Text size="sm" fw={500} inherit>
          {label}
        </Text>
        {active && (dir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </Group>
    </UnstyledButton>
  );
}
