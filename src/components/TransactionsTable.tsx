"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Group,
  SegmentedControl,
  Select,
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

import { formatCurrency } from "@/lib/currency";
import { EmptyState } from "@/components/EmptyState";
import { EditTransactionButton } from "@/components/forms/EditTransactionButton";
import { DeleteTransactionButton } from "@/components/forms/DeleteTransactionButton";

interface Option {
  value: string;
  label: string;
}

export interface TransactionRow {
  id: string;
  date: Date;
  description: string;
  type: "INFLOW" | "OUTFLOW";
  amount: number;
  accountId: string;
  accountName: string;
  accountCurrency: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string;
  /** Value shown in the table (and used for sorting/totals). */
  displayAmount: number;
  /** Currency the displayed value is expressed in. */
  displayCurrency: string;
}

interface TransactionsTableProps {
  transactions: TransactionRow[];
  accounts: Option[];
  categories: Option[];
  /** Message shown when there are no transactions at all. */
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
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    const rows = transactions.filter((tx) => {
      if (query && !tx.description.toLowerCase().includes(query)) return false;
      if (categoryId && tx.categoryId !== categoryId) return false;
      if (accountId && tx.accountId !== accountId) return false;
      if (type !== "ALL" && tx.type !== type) return false;
      return true;
    });

    rows.sort((a, b) => {
      const cmp =
        sortKey === "date"
          ? a.date.getTime() - b.date.getTime()
          : a.displayAmount - b.displayAmount;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [transactions, search, categoryId, accountId, type, sortKey, sortDir]);

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
          w={180}
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
            { value: "INFLOW", label: "Receitas" },
            { value: "OUTFLOW", label: "Despesas" },
          ]}
        />
      </Group>

      {filtered.length === 0 ? (
        <EmptyState message="Nenhuma transação corresponde aos filtros." icon={Search} />
      ) : (
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
              <TableTh w={90} />
            </TableTr>
          </TableThead>
          <TableTbody>
            {filtered.map((tx) => (
              <TableTr key={tx.id}>
                <TableTd>{tx.date.toLocaleDateString("pt-BR")}</TableTd>
                <TableTd>{tx.description}</TableTd>
                <TableTd>
                  {tx.categoryName ? (
                    <Badge color={tx.categoryColor} variant="light">
                      {tx.categoryName}
                    </Badge>
                  ) : (
                    <Text c="dimmed" size="sm">
                      —
                    </Text>
                  )}
                </TableTd>
                <TableTd>{tx.accountName}</TableTd>
                <TableTd ta="right">
                  <Text c={tx.type === "INFLOW" ? "teal" : "red"} fw={500}>
                    {tx.type === "INFLOW" ? "+" : "-"}
                    {formatCurrency(tx.displayAmount, tx.displayCurrency)}
                  </Text>
                </TableTd>
                <TableTd>
                  <Group justify="flex-end" gap={4} wrap="nowrap">
                    <EditTransactionButton
                      id={tx.id}
                      accountId={tx.accountId}
                      categoryId={tx.categoryId}
                      type={tx.type}
                      amount={tx.amount}
                      date={tx.date}
                      description={tx.description}
                      accounts={accounts}
                      categories={categories}
                    />
                    <DeleteTransactionButton id={tx.id} description={tx.description} />
                  </Group>
                </TableTd>
              </TableTr>
            ))}
          </TableTbody>
        </Table>
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
        {active &&
          (dir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </Group>
    </UnstyledButton>
  );
}
