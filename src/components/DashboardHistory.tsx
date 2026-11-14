"use client";

import { useState } from "react";
import { Alert, Card, Group, SegmentedControl, Stack, Table, Text } from "@mantine/core";
import { BarChart } from "@mantine/charts";
import { BarChart3, Table as TableIcon } from "lucide-react";
import type { HistoryMonth } from "@/lib/dashboardHistory";
import { formatCurrency } from "@/lib/currency";

export function DashboardHistory(props: { months: HistoryMonth[]; currency: string }) {
  const { months, currency } = props;
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <div>
            <Text fw={650} size="md">Evolução mensal — últimos 12 meses</Text>
            <Text size="xs" c="dimmed" mt={2}>
              Fluxo de caixa confirmado. O mês atual ainda está em andamento.
            </Text>
          </div>
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(val) => setView(val as "chart" | "table")}
            data={[
              {
                label: (
                  <Group gap={6} wrap="nowrap">
                    <BarChart3 size={14} aria-hidden />
                    <span>Gráfico</span>
                  </Group>
                ),
                value: "chart",
              },
              {
                label: (
                  <Group gap={6} wrap="nowrap">
                    <TableIcon size={14} aria-hidden />
                    <span>Tabela</span>
                  </Group>
                ),
                value: "table",
              },
            ]}
          />
        </Group>

        {months.some((month) => !month.complete) && (
          <Alert color="yellow" variant="light">
            Histórico parcial: faltam cotações para algumas moedas estrangeiras.
          </Alert>
        )}

        {view === "chart" ? (
          <BarChart
            h={280}
            data={months}
            dataKey="label"
            series={[
              { name: "income", label: "Receitas", color: "teal.9" },
              { name: "expenses", label: "Saídas de caixa", color: "red.9" },
            ]}
            valueFormatter={(value) => formatCurrency(value, currency)}
            barChartProps={{ accessibilityLayer: false }}
          />
        ) : (
          <Table.ScrollContainer
            minWidth={500}
            scrollAreaProps={{
              viewportProps: {
                "aria-label": "Comparação mensal com rolagem horizontal",
                role: "region",
                tabIndex: 0,
              },
            }}
          >
            <Table highlightOnHover>
              <Table.Caption>Comparação mensal em {currency}</Table.Caption>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Mês</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>Receitas</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>Saídas</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>Resultado líquido</Table.Th>
                  <Table.Th>Cotações</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {months.map((month) => (
                  <Table.Tr key={month.label}>
                    <Table.Th scope="row">{month.label}</Table.Th>
                    <Table.Td style={{ textAlign: "right" }}>{formatCurrency(month.income, currency)}</Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>{formatCurrency(month.expenses, currency)}</Table.Td>
                    <Table.Td
                      style={{
                        textAlign: "right",
                        color: month.net < 0 ? "var(--mantine-color-red-text)" : undefined,
                        fontWeight: 600,
                      }}
                    >
                      {formatCurrency(month.net, currency)}
                    </Table.Td>
                    <Table.Td>{month.complete ? "Completas" : "Parciais"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Card>
  );
}
