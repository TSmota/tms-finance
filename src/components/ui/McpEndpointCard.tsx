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
  ThemeIcon,
  Box,
} from "@mantine/core";
import { Check, Copy, Network, ShieldCheck, Terminal, Sparkles, Code2, Bot } from "lucide-react";

const noopSubscribe = () => () => {};

export function McpEndpointCard() {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "http://localhost:3000",
  );

  const endpointUrl = `${origin}/api/agent/mcp`;

  const mcpConfigSnippet = JSON.stringify(
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
    <Card
      withBorder
      radius="md"
      padding="lg"
      style={{
        transition: "transform 180ms ease, box-shadow 180ms ease",
        "&:hover": {
          transform: "translateY(-2px)",
        },
      }}
    >
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Group gap="sm" align="center">
            <ThemeIcon size={38} radius="md" variant="light" color="teal">
              <Network size={20} aria-hidden />
            </ThemeIcon>
            <div>
              <Text fw={700} size="md">
                Endpoint MCP do Servidor
              </Text>
              <Text size="xs" c="dimmed">
                Ponto de entrada streamable com suporte às especificações MCP 2025-11-25 e 2026-07-28
              </Text>
            </div>
          </Group>
          <Group gap="xs">
            <Badge variant="light" color="teal" size="sm">
              POST
            </Badge>
            <Badge variant="light" color="blue" size="sm">
              Streamable SSE
            </Badge>
            <Badge variant="light" color="gray" size="sm">
              JSON-RPC 2.0
            </Badge>
          </Group>
        </Group>

        <Box>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={0.5} mb={4}>
            URL de Conexão HTTP
          </Text>
          <Group gap="xs" wrap="nowrap">
            <TextInput
              value={endpointUrl}
              readOnly
              style={{ flex: 1, fontFamily: "var(--font-geist-mono), monospace" }}
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
        </Box>

        <Tabs defaultValue="gemini" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="gemini" leftSection={<Sparkles size={14} color="var(--mantine-color-grape-6)" aria-hidden />}>
              Gemini CLI / Antigravity
            </Tabs.Tab>
            <Tabs.Tab value="cursor" leftSection={<Code2 size={14} color="var(--mantine-color-blue-6)" aria-hidden />}>
              Cursor (.cursor/mcp.json)
            </Tabs.Tab>
            <Tabs.Tab value="claude" leftSection={<Bot size={14} color="var(--mantine-color-orange-6)" aria-hidden />}>
              Claude Desktop
            </Tabs.Tab>
            <Tabs.Tab value="curl" leftSection={<Terminal size={14} color="var(--mantine-color-teal-6)" aria-hidden />}>
              cURL / Shell
            </Tabs.Tab>
            <Tabs.Tab value="security" leftSection={<ShieldCheck size={14} color="var(--mantine-color-green-6)" aria-hidden />}>
              Defesas & Segurança
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="gemini" pt="xs">
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                No arquivo de configuração global do Gemini CLI / Antigravity (<code>~/.gemini/config/mcp_config.json</code>) ou no escopo do projeto (<code>.gemini/mcp_config.json</code>):
              </Text>
              <pre
                tabIndex={0}
                role="region"
                aria-label="Snippet de configuração para Gemini CLI e Antigravity"
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
                {mcpConfigSnippet}
              </pre>
              <Group justify="flex-end">
                <CopyButton value={mcpConfigSnippet} timeout={2500}>
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

          <Tabs.Panel value="cursor" pt="xs">
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                No arquivo <code>.cursor/mcp.json</code> da raiz do seu repositório ou globalmente em <code>~/.cursor/mcp.json</code> (<em>Cursor Settings &gt; Features &gt; MCP</em>):
              </Text>
              <pre
                tabIndex={0}
                role="region"
                aria-label="Snippet de configuração para Cursor"
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
                {mcpConfigSnippet}
              </pre>
              <Group justify="flex-end">
                <CopyButton value={mcpConfigSnippet} timeout={2500}>
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

          <Tabs.Panel value="claude" pt="xs">
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                No seu arquivo <code>claude_desktop_config.json</code>:
                <br />• <strong>macOS:</strong> <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>
                <br />• <strong>Windows:</strong> <code>%APPDATA%\Claude\claude_desktop_config.json</code>
                <br />• <strong>Linux:</strong> <code>~/.config/Claude/claude_desktop_config.json</code>
              </Text>
              <pre
                tabIndex={0}
                role="region"
                aria-label="Snippet de configuração para Claude Desktop"
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
                {mcpConfigSnippet}
              </pre>
              <Group justify="flex-end">
                <CopyButton value={mcpConfigSnippet} timeout={2500}>
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
                Exemplo de chamada direta JSON-RPC 2.0 listando ferramentas disponíveis:
              </Text>
              <pre
                tabIndex={0}
                role="region"
                aria-label="Snippet de comando cURL para teste do endpoint"
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
                <strong>Proteção de credenciais:</strong> Tokens de 256 bits com hash HMAC-SHA256 e pepper exclusivo. O segredo em texto puro nunca é gravado no banco de dados.
              </Text>
              <Text size="sm">
                <strong>Confirmação em duas fases:</strong> Ferramentas destrutivas (exclusão de contas, cartões, categorias, pessoas e dívidas) exigem o escopo <code>destructive:write</code> e confirmação humana no cliente via elicitação MCP.
              </Text>
              <Text size="sm">
                <strong>Rate Limiting deslizante:</strong> Teto de 60 requisições por minuto por token, blindando contra loops infinitos de agentes autônomos.
              </Text>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Card>
  );
}
