"use client";
import { Alert, Card, Stack, Table, Text } from "@mantine/core";
import { BarChart } from "@mantine/charts";
import type { HistoryMonth } from "@/lib/dashboardHistory";
import { formatCurrency } from "@/lib/currency";

export function DashboardHistory(props: { months: HistoryMonth[]; currency: string }) {
  const { months, currency } = props;
  return <Card withBorder><Stack>
    <Text fw={600}>Evolução mensal — últimos 12 meses</Text>
    <Text size="sm">Fluxo de caixa confirmado, incluindo pagamentos de faturas. Transferências internas e metas manuais não entram. O mês atual ainda está em andamento.</Text>
    {months.some((month) => !month.complete) && <Alert color="yellow">Histórico parcial: faltam cotações. Consulte a situação de cada mês na tabela.</Alert>}
    <BarChart h={260} data={months} dataKey="label" series={[{ name: "income", label: "Receitas", color: "teal.9" }, { name: "expenses", label: "Saídas de caixa", color: "red.9" }]} valueFormatter={(value) => formatCurrency(value, currency)} barChartProps={{ accessibilityLayer: false }} />
    <Table.ScrollContainer minWidth={500}><Table><Table.Caption>Comparação mensal em {currency}</Table.Caption><Table.Thead><Table.Tr><Table.Th>Mês</Table.Th><Table.Th>Receitas</Table.Th><Table.Th>Saídas</Table.Th><Table.Th>Resultado</Table.Th><Table.Th>Cotações</Table.Th></Table.Tr></Table.Thead><Table.Tbody>
      {months.map((month) => <Table.Tr key={month.label}><Table.Th scope="row">{month.label}</Table.Th><Table.Td>{formatCurrency(month.income, currency)}</Table.Td><Table.Td>{formatCurrency(month.expenses, currency)}</Table.Td><Table.Td>{formatCurrency(month.net, currency)}</Table.Td><Table.Td>{month.complete ? "Completas" : "Parciais"}</Table.Td></Table.Tr>)}
    </Table.Tbody></Table></Table.ScrollContainer>
  </Stack></Card>;
}
