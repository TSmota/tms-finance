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
    <Center className="empty-state" py="xl">
      <Stack align="center" gap="xs">
        <div className="empty-state-icon"><Icon size={28} strokeWidth={1.5} aria-hidden /></div>
        <Text c="dimmed" ta="center" maw={360}>
          {message}
        </Text>
        {action}
      </Stack>
    </Center>
  );
}
