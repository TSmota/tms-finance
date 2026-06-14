"use client";

import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { TriangleAlert } from "lucide-react";

interface DashboardErrorProps {
  error: Error;
  reset: () => void;
}

export default function DashboardError(props: DashboardErrorProps) {
  const { error, reset } = props;

  return (
    <Center mih="60vh">
      <Stack align="center" gap="sm" maw={420}>
        <TriangleAlert size={40} color="var(--mantine-color-red-6)" />
        <Title order={3}>Algo deu errado</Title>
        <Text c="dimmed" ta="center">
          {error.message ||
            "Não foi possível carregar esta página. Pode ser um problema temporário no banco de dados ou no serviço de câmbio."}
        </Text>
        <Button color="teal" onClick={reset}>
          Tentar novamente
        </Button>
      </Stack>
    </Center>
  );
}
