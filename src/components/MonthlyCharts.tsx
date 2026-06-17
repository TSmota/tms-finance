"use client";

import { Card, SimpleGrid, Text } from "@mantine/core";
import { PieChart, BarChart } from "@mantine/charts";

interface CategoryData {
  name: string;
  color: string;
  value: number;
}

interface MonthlyChartsProps {
  byCategory: CategoryData[];
  income: number;
  expenses: number;
  actualExpenses: number;
  projectedRecurringExpenses: number;
}

export function MonthlyCharts(props: MonthlyChartsProps) {
  const {
    byCategory,
    income,
    expenses,
    actualExpenses,
    projectedRecurringExpenses,
  } = props;

  const pieData = byCategory.map((category) => ({
    name: category.name,
    value: Number(category.value.toFixed(2)),
    color: category.color,
  }));

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Card withBorder radius="md" padding="lg">
        <Text fw={600} mb="md">
          Despesas por categoria
        </Text>
        {pieData.length === 0 ? (
          <Text c="dimmed" size="sm">
            Nenhuma despesa neste mês.
          </Text>
        ) : (
          <PieChart
            data={pieData}
            withTooltip
            tooltipDataSource="segment"
            size={220}
          />
        )}
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fw={600} mb="md">
          Receitas vs. despesas
        </Text>
        <BarChart
          h={250}
          data={[
            {
              label: "Este mês",
              Receitas: Number(income.toFixed(2)),
              "Despesas realizadas": Number(actualExpenses.toFixed(2)),
              "Despesas recorrentes (estimativa mensal)": Number(projectedRecurringExpenses.toFixed(2)),
              "Despesas totais": Number(expenses.toFixed(2)),
            },
          ]}
          dataKey="label"
          series={[
            { name: "Receitas", color: "teal.6" },
            { name: "Despesas realizadas", color: "red.6" },
            { name: "Despesas recorrentes (estimativa mensal)", color: "orange.6" },
          ]}
        />
      </Card>
    </SimpleGrid>
  );
}
