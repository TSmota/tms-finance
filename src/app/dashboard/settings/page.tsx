import Link from "next/link";
import { Button, Card, Group, Stack, Text } from "@mantine/core";
import { Bot } from "lucide-react";

import { AppearanceSetting } from "@/components/ui/AppearanceSetting";

import { requireUser } from "@/lib/session";
import { BaseCurrencyForm } from "@/components/forms/BaseCurrencyForm";
import { PasswordChangeForm } from "@/components/forms/PasswordChangeForm";
import { ExportDataButton } from "@/components/forms/ExportDataButton";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <Stack gap="lg">
      <PageHeader
        title="Configurações"
        subtitle="Preferências que valem para todas as telas"
      />

      <Card withBorder radius="md" padding="lg">
        <Text fw={600} mb="xs">Aparência</Text>
        <Text size="sm" c="dimmed" mb="md">Escolha entre os temas claro, escuro ou sincronizado com o sistema operacional. A preferência fica salva neste navegador.</Text>
        <div><AppearanceSetting /></div>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fw={600} mb="xs">
          Moeda dos relatórios
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          Cada conta, cartão e dívida guarda a moeda em que foi criada. Para
          somar tudo num total só, os relatórios convertem para esta moeda.
        </Text>

        <BaseCurrencyForm current={user.baseCurrency ?? "BRL"} />
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fw={600} mb="xs">
          Senha
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          Alterar a senha encerra todas as sessões abertas, inclusive esta.
        </Text>

        <PasswordChangeForm />
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fw={600} mb="xs">
          Agentes de IA e Conexão MCP
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          Conecte seus assistentes de IA (Claude Desktop, Cursor, Antigravity, OpenCode) para consultar e operar suas finanças com segurança via Model Context Protocol.
        </Text>

        <Group>
          <Button
            component={Link}
            href="/dashboard/agents"
            variant="light"
            leftSection={<Bot size={16} aria-hidden />}
          >
            Gerenciar conexões MCP
          </Button>
        </Group>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fw={600} mb="xs">
          Seus dados
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          Baixe um arquivo JSON com contas, cartões, faturas, categorias,
          pessoas, dívidas, recorrentes e todos os lançamentos. É a sua cópia:
          nada aqui depende de continuar usando este app.
        </Text>

        <ExportDataButton />
      </Card>
    </Stack>
  );
}
