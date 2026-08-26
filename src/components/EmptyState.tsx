import { Center, Stack, Text } from "@mantine/core";
import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  icon?: LucideIcon;
  /** Renderizada abaixo da mensagem, tipicamente o botão que resolve o vazio. */
  action?: ReactNode;
}

export function EmptyState(props: EmptyStateProps) {
  const { message, icon: Icon = Inbox, action } = props;

  return (
    <Center py="xl">
      <Stack align="center" gap="xs">
        <Icon size={40} strokeWidth={1.5} color="var(--mantine-color-dimmed)" aria-hidden />
        <Text c="dimmed" ta="center" maw={360}>
          {message}
        </Text>
        {action}
      </Stack>
    </Center>
  );
}
