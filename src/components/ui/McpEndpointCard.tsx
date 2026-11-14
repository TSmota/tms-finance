"use client";

import { useSyncExternalStore } from "react";
import {
  Badge,
  Card,
  CopyButton,
  Group,
  Stack,
  Tabs,
  Text,
  TextInput,
  Tooltip,
  Button,
} from "@mantine/core";
import { Check, Copy, Network, ShieldCheck, Terminal, Cpu } from "lucide-react";

const noopSubscribe = () => () => {};

export function McpEndpointCard() {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "http://localhost:3000",
  );

  const endpointUrl = `${origin}/api/agent/mcp`;

  const claudeDesktopSnippet = JSON.stringify(
    {
      mcpServers: {
        "tms-finance": {
          url: endpointUrl,
          headers: {
            Authorization: "Bearer <SEU_TOKEN_AQUI>",
          },
        },
      },
    },
    null,
    2,
  );

  const curlSnippet = `curl -X POST ${endpointUrl} \\
  -H "Authorization: Bearer <SEU_TOKEN_AQUI>" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}'`;

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Group gap="xs" mb={4}>
              <Network size={20} color="var(--mantine-color-teal-6)" aria-hidden />
              <Text fw={700} size="md">
                Endpoint MCP do Servidor
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              Ponto de entrada do protocolo Model Context Protocol para agentes autônomos e assistentes de IA
            </Text>
          </div>
          <Group gap="xs">
            <Badge variant="light" color="teal">
              POST
            </Badge>
            <Badge variant="light" color="blue">
              MCP HTTP Streamable
            </Badge>
            <Badge variant="light" color="gray">
              Revisões 2025-11-25 & 2026-07-28
            </Badge>
          </Group>
        </Group>

        <div>
          <Text size="xs" fw={600} c="dimmed" mb={4}>
            URL DE CONEXÃO
          </Text>
          <Group gap="xs" wrap="nowrap">
            <TextInput
              value={endpointUrl}
              readOnly
              style={{ flex: 1 }}
              aria-label="URL do endpoint MCP"
            />
            <CopyButton value={endpointUrl} timeout={2500}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Copiado!" : "Copiar URL"} withArrow>
                  <Button
                    variant="light"
                    color={copied ? "teal" : "gray"}
                    onClick={copy}
                    leftSection={copied ? <Check size={16} /> : <Copy size={16} />}
                  >
                    {copied ? "Copiada" : "Copiar URL"}
                  </Button>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
        </div>

        <Tabs defaultValue="desktop" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="desktop" leftSection={<Cpu size={14} aria-hidden />}>
              Claude Desktop / Cursor / Antigravity
            </Tabs.Tab>
            <Tabs.Tab value="curl" leftSection={<Terminal size={14} aria-hidden />}>
              Chamada HTTP / cURL
            </Tabs.Tab>
            <Tabs.Tab value="security" leftSection={<ShieldCheck size={14} aria-hidden />}>
              Defesas & Segurança
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="desktop" pt="xs">
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                No arquivo de configuração do seu cliente (ex.: <code>claude_desktop_config.json</code> ou <code>.cursor/mcp.json</code>):
              </Text>
              <pre
                tabIndex={0}
                role="region"
                aria-label="Snippet de configuração para clientes MCP"
                style={{
                  margin: 0,
                  padding: "12px",
                  borderRadius: "6px",
                  backgroundColor: "var(--mantine-color-dark-8, #1a1b1e)",
                  color: "#f8f9fa",
                  fontSize: "12px",
                  fontFamily: "var(--font-geist-mono), monospace",
                  overflowX: "auto",
                }}
              >
                {claudeDesktopSnippet}
              </pre>
              <Group justify="flex-end">
                <CopyButton value={claudeDesktopSnippet} timeout={2500}>
                  {({ copied, copy }) => (
                    <Button
                      variant="subtle"
                      color={copied ? "teal" : "gray"}
                      size="xs"
                      onClick={copy}
                      leftSection={copied ? <Check size={14} /> : <Copy size={14} />}
                    >
                      {copied ? "Copiado!" : "Copiar configuração"}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="curl" pt="xs">
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                Exemplo de chamada direta JSON-RPC 2.0 listando ferramentas:
              </Text>
              <pre
                tabIndex={0}
                role="region"
                aria-label="Snippet de configuração para clientes MCP"
                style={{
                  margin: 0,
                  padding: "12px",
                  borderRadius: "6px",
                  backgroundColor: "var(--mantine-color-dark-8, #1a1b1e)",
                  color: "#f8f9fa",
                  fontSize: "12px",
                  fontFamily: "var(--font-geist-mono), monospace",
                  overflowX: "auto",
                }}
              >
                {curlSnippet}
              </pre>
              <Group justify="flex-end">
                <CopyButton value={curlSnippet} timeout={2500}>
                  {({ copied, copy }) => (
                    <Button
                      variant="subtle"
                      color={copied ? "teal" : "gray"}
                      size="xs"
                      onClick={copy}
                      leftSection={copied ? <Check size={14} /> : <Copy size={14} />}
                    >
                      {copied ? "Copiado!" : "Copiar comando cURL"}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="security" pt="xs">
            <Stack gap="xs">
              <Text size="sm">
                <strong>Proteção de credenciais:</strong> Os tokens são valores de 256 bits com hash HMAC-SHA256 e pepper exclusivo. O segredo em claro nunca é armazenado no banco de dados.
              </Text>
              <Text size="sm">
                <strong>Confirmação em duas fases:</strong> Ferramentas de remoção em cascata (contas, cartões, categorias, pessoas e dívidas) exigem o escopo <code>destructive:write</code> e confirmação humana no cliente via protocolo de elicitação MCP.
              </Text>
              <Text size="sm">
                <strong>Rate Limiting:</strong> Janela deslizante de até 60 requisições por minuto por token, prevenindo loops involuntários do agente.
              </Text>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Card>
  );
}
