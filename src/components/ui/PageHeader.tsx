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
    <Group className="page-header" justify="space-between" align="center" gap="md">
      <Stack gap={6} miw={0}>
        <Title order={1} className="page-title">{title}</Title>
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
