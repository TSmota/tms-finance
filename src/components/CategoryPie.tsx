"use client";

import { Box, Group, Stack, Text } from "@mantine/core";
import { PieChart } from "@mantine/charts";

import { DEFAULT_CATEGORY_COLOR, formatCurrency } from "@/lib/currency";
import { capSlices, type CategorySlice } from "@/lib/categoryRollup";

interface CategoryPieProps {
  slices: CategorySlice[];
  /** Soma das fatias, usada para a porcentagem. */
  total: number;
  currency: string;
  /** Fatias exibidas antes de agrupar a cauda em "Outras". */
  maxSlices?: number;
  emptyMessage?: string;
}

/**
 * Pizza de categorias **com legenda**.
 *
 * O `PieChart` do Mantine 9 não tem prop de legenda — só rótulos sobre as
 * fatias, que se sobrepõem quando as fatias são finas. Sem legenda não se
 * identifica qual fatia é qual categoria, o que torna o gráfico decorativo. A
 * lista ao lado resolve isso e ainda mostra valor e porcentagem, que o gráfico
 * sozinho não dá.
 */
export function CategoryPie(props: CategoryPieProps) {
  const {
    slices,
    total,
    currency,
    maxSlices = 8,
    emptyMessage = "Nenhum gasto neste período.",
  } = props;

  if (slices.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {emptyMessage}
      </Text>
    );
  }

  const shown = capSlices(slices, maxSlices);
  // Fatia única desenha um círculo cheio, que não informa nada além dos 100% já
  // escritos na legenda — e ocupa a altura de um gráfico de verdade.
  const withChart = shown.length > 1;

  const data = shown.map((slice) => ({
    name: slice.name,
    // Duas casas: o gráfico só precisa da proporção, e o valor exato está na legenda.
    value: Number(slice.value.toFixed(2)),
    color: slice.color ?? DEFAULT_CATEGORY_COLOR,
  }));

  return (
    <Group align="center" gap="lg" wrap="nowrap">
      {withChart && (
        /*
          A legenda ao lado já traz os dados em texto. `aria-hidden` aqui seria
          violação: o Recharts deixa o `<svg>` focável, e o foco pousaria num nó
          que o leitor não anuncia. Desligar a camada resolve na origem e
          preserva o tooltip de hover.
        */
        <PieChart
          data={data}
          withTooltip
          tooltipDataSource="segment"
          size={180}
          strokeWidth={0}
          pieChartProps={{ accessibilityLayer: false }}
          /* `rootTabIndex`, não `tabIndex`: é o prop com que o `Pie` monta o `<g>`. */
          pieProps={{ rootTabIndex: -1 }}
        />
      )}
      <Stack gap={6} flex={1} miw={0}>
        {shown.map((slice, index) => (
          <Group key={`${slice.id ?? "none"}-${index}`} gap="xs" wrap="nowrap" justify="space-between">
            <Group gap={8} wrap="nowrap" miw={0}>
              <Box
                w={10}
                h={10}
                style={{
                  borderRadius: 2,
                  flexShrink: 0,
                  background: slice.color ?? DEFAULT_CATEGORY_COLOR,
                }}
              />
              <Text size="sm" truncate>
                {slice.name}
              </Text>
            </Group>
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={500}>
                {formatCurrency(slice.value, currency)}
              </Text>
              <Text size="xs" c="dimmed" w={38} ta="right">
                {total > 0 ? `${((slice.value / total) * 100).toFixed(0)}%` : "—"}
              </Text>
            </Group>
          </Group>
        ))}
      </Stack>
    </Group>
  );
}
