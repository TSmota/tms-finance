"use client";

import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import { BarChart } from "@mantine/charts";

import type { CategorySlice } from "@/lib/categoryRollup";
import { formatCurrency } from "@/lib/currency";
import { CategoryPie } from "@/components/CategoryPie";

interface MonthlyChartsProps {
  /** Gasto por categoria raiz, já com rollup de subcategoria. */
  byCategory: CategorySlice[];
  /** Soma de `byCategory` — despesas de conta + compras no cartão. */
  spendingTotal: number;
  income: number;
  /** Saída de caixa do mês, incluindo pagamento de fatura. */
  expenses: number;
  /** Parte de `spendingTotal` que foi no cartão e ainda não saiu da conta. */
  cardSpending: number;
  currency: string;
}

export function MonthlyCharts(props: MonthlyChartsProps) {
  const { byCategory, spendingTotal, income, expenses, cardSpending, currency } = props;

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Card withBorder radius="md" padding="lg">
        <Stack gap={2} mb="md">
          <Text fw={600}>Gasto por categoria</Text>
          <Text size="xs" c="dimmed">
            {cardSpending > 0
              ? `Inclui ${formatCurrency(cardSpending, currency)} no cartão, que ainda não saiu da conta`
              : "Despesas de conta e compras no cartão, pela data do gasto"}
          </Text>
        </Stack>
        <CategoryPie
          slices={byCategory}
          total={spendingTotal}
          currency={currency}
          emptyMessage="Nenhum gasto neste mês."
        />
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap={2} mb="md">
          <Text fw={600}>Entradas e saídas de caixa</Text>
          <Text size="xs" c="dimmed">
            O que de fato entrou e saiu das contas
          </Text>
        </Stack>
        {/* O gráfico não tem legenda em texto como o `CategoryPie`. */}
        <Text className="visually-hidden">
          {`Receitas: ${formatCurrency(income, currency)}. Despesas: ${formatCurrency(expenses, currency)}.`}
        </Text>
        <BarChart
          h={220}
          data={[
            {
              label: "Este mês",
              Receitas: Number(income.toFixed(2)),
              Despesas: Number(expenses.toFixed(2)),
            },
          ]}
          dataKey="label"
          series={[
            { name: "Receitas", color: "teal.9" },
            { name: "Despesas", color: "red.9" },
          ]}
          withLegend
          barChartProps={{ accessibilityLayer: false }}
        />
      </Card>
    </SimpleGrid>
  );
}
