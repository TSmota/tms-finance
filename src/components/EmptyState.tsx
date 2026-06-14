import { Center, Stack, Text } from "@mantine/core";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  message: string;
}

export function EmptyState(props: EmptyStateProps) {
  const { message } = props;

  return (
    <Center py="xl">
      <Stack align="center" gap="xs">
        <Inbox size={40} strokeWidth={1.5} color="var(--mantine-color-dimmed)" />
        <Text c="dimmed" ta="center" maw={360}>
          {message}
        </Text>
      </Stack>
    </Center>
  );
}
