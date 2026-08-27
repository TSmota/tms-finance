import { Center, Stack, Text, Title } from "@mantine/core";
import { Compass } from "lucide-react";

import { LinkButton } from "@/components/ui/AppLink";

/**
 * Fica dentro de `/dashboard` de propósito: sem ele, um link antigo levaria o
 * usuário ao 404 padrão do Next — em inglês e fora da casca do app, sem
 * navegação para voltar.
 */
export default function DashboardNotFound() {
  return (
    <Center mih="60vh">
      <Stack align="center" gap="sm" maw={420}>
        <Compass size={40} color="var(--mantine-color-dimmed)" aria-hidden />
        <Title order={1} size="h3">
          Página não encontrada
        </Title>
        <Text c="dimmed" ta="center">
          O endereço não existe, ou o registro que ele apontava foi removido.
        </Text>
        <LinkButton href="/dashboard" size="sm">
          Voltar ao painel
        </LinkButton>
      </Stack>
    </Center>
  );
}
