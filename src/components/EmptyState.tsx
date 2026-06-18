import { Center, Stack, Text } from "@mantine/core";
import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  /** Optional icon (defaults to Inbox). */
  icon?: LucideIcon;
  /** Optional call-to-action rendered below the message (e.g. a button). */
  action?: ReactNode;
}

export function EmptyState(props: EmptyStateProps) {
  const { message, icon: Icon = Inbox, action } = props;

  return (
    <Center py="xl">
      <Stack align="center" gap="xs">
        <Icon size={40} strokeWidth={1.5} color="var(--mantine-color-dimmed)" />
        <Text c="dimmed" ta="center" maw={360}>
          {message}
        </Text>
        {action}
      </Stack>
    </Center>
  );
}
