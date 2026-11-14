"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { Activity, Eye } from "lucide-react";

import type { AgentAuditLogSummary } from "@/lib/agentAudit";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/ui/IconButton";

interface AgentAuditTableProps {
  logs: AgentAuditLogSummary[];
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function getVerdictBadge(verdict: string) {
  switch (verdict) {
    case "OK":
      return <Badge color="teal" variant="light" size="sm">OK</Badge>;
    case "CONFIRM_REQUIRED":
      return <Badge color="cyan" variant="light" size="sm">Confirmação Solicitada</Badge>;
    case "FORBIDDEN_SCOPE":
      return <Badge color="orange" variant="light" size="sm">Escopo Insuficiente</Badge>;
    case "RATE_LIMITED":
      return <Badge color="red" variant="light" size="sm">Limite Excedido</Badge>;
    case "INVALID_INPUT":
      return <Badge color="red" variant="light" size="sm">Entrada Inválida</Badge>;
    case "DOMAIN_ERROR":
      return <Badge color="red" variant="light" size="sm">Erro de Domínio</Badge>;
    case "FX_UNAVAILABLE":
      return <Badge color="yellow" variant="light" size="sm">Câmbio Indisponível</Badge>;
    default:
      return <Badge color="red" variant="light" size="sm">{verdict}</Badge>;
  }
}

export function AgentAuditTable(props: AgentAuditTableProps) {
  const { logs } = props;
  const [selectedLog, setSelectedLog] = useState<AgentAuditLogSummary | null>(null);

  if (logs.length === 0) {
    return (
      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <Group gap="xs">
            <Activity size={18} color="var(--mantine-color-teal-6)" aria-hidden />
            <Text fw={600} size="md">
              Atividades e Auditoria MCP
            </Text>
          </Group>
          <EmptyState
            message="Nenhuma atividade de agente registrada ainda. Conecte um agente via MCP para visualizar suas chamadas, verificações de escopo e tempos de resposta."
          />
        </Stack>
      </Card>
    );
  }

  return (
    <>
      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <Activity size={18} color="var(--mantine-color-teal-6)" aria-hidden />
              <div>
                <Text fw={600} size="md">
                  Atividades e Auditoria MCP
                </Text>
                <Text size="sm" c="dimmed">
                  Registro completo de chamadas, verificação de escopos e resposta das ferramentas
                </Text>
              </div>
            </Group>
            <Badge variant="light" color="gray">
              {logs.length} {logs.length === 1 ? "registro recente" : "registros recentes"}
            </Badge>
          </Group>

          <Table.ScrollContainer
            minWidth={720}
            scrollAreaProps={{
              viewportProps: {
                "aria-label": "Histórico de auditoria MCP com rolagem horizontal",
                role: "region",
                tabIndex: 0,
              },
            }}
          >
            <Table highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th scope="col">Data / Hora</Table.Th>
                  <Table.Th scope="col">Agente</Table.Th>
                  <Table.Th scope="col">Ferramenta</Table.Th>
                  <Table.Th scope="col">Veredito</Table.Th>
                  <Table.Th scope="col">Duração</Table.Th>
                  <Table.Th scope="col" ta="right">
                    Detalhes
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {logs.map((log) => (
                  <Table.Tr key={log.id}>
                    <Table.Td>
                      <Text size="xs" style={{ whiteSpace: "nowrap" }}>
                        {formatDate(log.createdAt)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="xs" fw={500}>
                          {log.tokenLabel ?? "Desconhecido"}
                        </Text>
                        {log.tokenHint && (
                          <Text
                            size="xs"
                            c="dimmed"
                            style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                          >
                            {log.tokenHint}…
                          </Text>
                        )}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text
                        size="xs"
                        fw={600}
                        style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                      >
                        {log.tool}
                      </Text>
                    </Table.Td>
                    <Table.Td>{getVerdictBadge(log.verdict)}</Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {log.durationMs} ms
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <IconButton
                        label={`Ver detalhes da chamada ${log.tool}`}
                        color="gray"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye size={16} aria-hidden />
                      </IconButton>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      </Card>

      <Modal
        opened={selectedLog !== null}
        onClose={() => setSelectedLog(null)}
        title={
          <Text fw={600}>
            Detalhes da chamada: {selectedLog?.tool}
          </Text>
        }
        size="lg"
        centered
      >
        {selectedLog && (
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed">
                  Horário
                </Text>
                <Text size="sm" fw={500}>
                  {formatDate(selectedLog.createdAt)}
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Veredito
                </Text>
                <div>{getVerdictBadge(selectedLog.verdict)}</div>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Duração
                </Text>
                <Text size="sm" fw={500}>
                  {selectedLog.durationMs} ms
                </Text>
              </div>
            </Group>

            {selectedLog.errorCode && (
              <div>
                <Text size="xs" c="dimmed">
                  Código de Erro
                </Text>
                <Badge color="red" variant="light">
                  {selectedLog.errorCode}
                </Badge>
              </div>
            )}

            <div>
              <Text size="xs" fw={600} c="dimmed" mb={4}>
                Argumentos da Chamada (Sanitizados)
              </Text>
              <pre
                tabIndex={0}
                role="region"
                aria-label="Argumentos da chamada em JSON"
                style={{
                  margin: 0,
                  padding: "12px",
                  borderRadius: "6px",
                  backgroundColor: "var(--mantine-color-dark-8, #1a1b1e)",
                  color: "#f8f9fa",
                  fontSize: "12px",
                  fontFamily: "var(--font-geist-mono), monospace",
                  overflowX: "auto",
                  maxHeight: "240px",
                }}
              >
                {JSON.stringify(selectedLog.args, null, 2)}
              </pre>
            </div>

            {selectedLog.affectedIds.length > 0 && (
              <div>
                <Text size="xs" fw={600} c="dimmed" mb={4}>
                  IDs Afetados ({selectedLog.affectedIds.length})
                </Text>
                <Group gap={4} wrap="wrap">
                  {selectedLog.affectedIds.map((id) => (
                    <Badge key={id} size="xs" variant="outline" color="gray">
                      {id}
                    </Badge>
                  ))}
                </Group>
              </div>
            )}

            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={() => setSelectedLog(null)}>
                Fechar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
