import { Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Ações renderizadas à direita, como o botão "Adicionar". */
  action?: ReactNode;
}

export function PageHeader(props: PageHeaderProps) {
  const { title, subtitle, action } = props;

  return (
    <Group justify="space-between" align="flex-end" wrap="nowrap">
      <Stack gap={2}>
        <Title order={1} size="h2">{title}</Title>
        {subtitle && (
          <Text size="sm" c="dimmed">
            {subtitle}
          </Text>
        )}
      </Stack>
      {action}
    </Group>
  );
}
