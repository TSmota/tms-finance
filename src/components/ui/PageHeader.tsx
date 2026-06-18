import { Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Actions rendered on the right (e.g. "Adicionar" buttons). */
  action?: ReactNode;
}

/**
 * Standard page header: title (+ optional subtitle) on the left and an
 * optional action slot on the right. Replaces the hand-rolled
 * `<Group justify="space-between"><Title/>…</Group>` block repeated across pages.
 */
export function PageHeader(props: PageHeaderProps) {
  const { title, subtitle, action } = props;

  return (
    <Group justify="space-between" align="flex-end" wrap="nowrap">
      <Stack gap={2}>
        <Title order={2}>{title}</Title>
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
