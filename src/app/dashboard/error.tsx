"use client";

import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { TriangleAlert } from "lucide-react";

interface DashboardErrorProps {
  error: Error;
  reset: () => void;
}

/**
 * A mensagem é fixa, e não `error.message`.
 *
 * Em produção o Next substitui a mensagem de erro de servidor por um texto
 * genérico **em inglês**, que é *truthy*: o fallback em português que existia
 * aqui nunca era alcançado onde ele importava. Erro de domínio já chega ao
 * usuário pelo `ActionResult` do formulário; o que sobra para este boundary é
 * falha de infraestrutura, que não tem nada de útil a dizer.
 */
export default function DashboardError(props: DashboardErrorProps) {
  const { reset } = props;

  return (
    <Center mih="60vh">
      <Stack align="center" gap="sm" maw={420}>
        <TriangleAlert size={40} color="var(--mantine-color-red-6)" aria-hidden />
        <Title order={1} size="h3">Algo deu errado</Title>
        <Text c="dimmed" ta="center">
          Não foi possível carregar esta página. Pode ser um problema temporário no banco de
          dados ou no serviço de câmbio.
        </Text>
        <Button color="teal" onClick={reset}>
          Tentar novamente
        </Button>
      </Stack>
    </Center>
  );
}
