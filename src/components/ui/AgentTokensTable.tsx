"use client";

import {
  Badge,
  Card,
  CopyButton,
  Group,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { Check, Copy } from "lucide-react";

import type { AgentTokenSummary } from "@/lib/agentTokens";
import { RevokeAgentTokenButton } from "@/components/forms/RevokeAgentTokenButton";
import { MintAgentTokenButton } from "@/components/forms/MintAgentTokenButton";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/ui/IconButton";

interface AgentTokensTableProps {
  tokens: AgentTokenSummary[];
}

function formatDate(date: Date | null): string {
  if (!date) {
    return "—";
  }

  return new Date(date).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getTokenStatus(token: AgentTokenSummary, now = new Date()) {
  if (token.revokedAt) {
    return {
      status: "REVOKED",
      label: `Revogado em ${formatDate(token.revokedAt)}`,
      color: "red",
    };
  }

  if (token.expiresAt && new Date(token.expiresAt).getTime() <= now.getTime()) {
    return {
      status: "EXPIRED",
      label: `Expirado em ${formatDate(token.expiresAt)}`,
      color: "yellow",
    };
  }

  return {
    status: "ACTIVE",
    label: "Ativo",
    color: "teal",
  };
}

export function AgentTokensTable(props: AgentTokensTableProps) {
  const { tokens } = props;

  if (tokens.length === 0) {
    return (
      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <Text fw={600} size="md">
            Conexões e Tokens de Agente
          </Text>
          <EmptyState
            message="Nenhum token de agente emitido ainda. Conecte seu assistente de IA criando uma credencial com permissões personalizadas."
            action={<MintAgentTokenButton />}
          />
        </Stack>
      </Card>
    );
  }

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
        <Group justify="space-between" align="center">
          <div>
            <Text fw={600} size="md">
              Conexões e Tokens de Agente
            </Text>
            <Text size="sm" c="dimmed">
              Gerencie credenciais ativas e revogue acessos quando necessário
            </Text>
          </div>
          <Badge variant="light" color="gray">
            {tokens.length} {tokens.length === 1 ? "credencial" : "credenciais"}
          </Badge>
        </Group>

        <Table.ScrollContainer
          minWidth={720}
          scrollAreaProps={{
            viewportProps: {
              "aria-label": "Lista de tokens de agente com rolagem horizontal",
              role: "region",
              tabIndex: 0,
            },
          }}
        >
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th scope="col">Rótulo / Token</Table.Th>
                <Table.Th scope="col">Status</Table.Th>
                <Table.Th scope="col">Escopos</Table.Th>
                <Table.Th scope="col">Último uso</Table.Th>
                <Table.Th scope="col">Expiração</Table.Th>
                <Table.Th scope="col" ta="right">
                  Ações
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tokens.map((token) => {
                const status = getTokenStatus(token);
                const isRevoked = status.status === "REVOKED";

                return (
                  <Table.Tr key={token.id}>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text fw={600} size="sm">
                          {token.label}
                        </Text>
                        <Group gap={6} wrap="nowrap">
                          <Text
                            size="xs"
                            c="dimmed"
                            style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                          >
                            {token.tokenHint}…
                          </Text>
                          <CopyButton value={token.tokenHint} timeout={2000}>
                            {({ copied, copy }) => (
                              <Tooltip label={copied ? "Copiado!" : "Copiar prefixo"} withArrow>
                                <IconButton
                                  label={`Copiar prefixo do token ${token.label}`}
                                  color={copied ? "teal" : "gray"}
                                  onClick={copy}
                                >
                                  {copied ? <Check size={12} /> : <Copy size={12} />}
                                </IconButton>
                              </Tooltip>
                            )}
                          </CopyButton>
                        </Group>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={status.color} variant="light" size="sm">
                        {status.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="wrap" maw={300}>
                        {token.scopes.map((scope) => (
                          <Badge
                            key={scope}
                            size="xs"
                            variant="outline"
                            color={
                              scope.startsWith("finance:")
                                ? "blue"
                                : scope.startsWith("destructive:")
                                  ? "red"
                                  : "teal"
                            }
                          >
                            {scope}
                          </Badge>
                        ))}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c={token.lastUsedAt ? undefined : "dimmed"}>
                        {token.lastUsedAt ? formatDate(token.lastUsedAt) : "Nunca utilizado"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c={token.expiresAt ? undefined : "dimmed"}>
                        {token.expiresAt ? formatDate(token.expiresAt) : "Sem expiração"}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <RevokeAgentTokenButton
                        id={token.id}
                        label={token.label}
                        tokenHint={token.tokenHint}
                        disabled={isRevoked}
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
    </Card>
  );
}
