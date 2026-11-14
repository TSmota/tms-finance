"use client";

import { SimpleGrid, Card, Group, Stack, Text, Badge, ThemeIcon } from "@mantine/core";
import { KeyRound, Activity, CheckCircle2, Gauge } from "lucide-react";
import type { AgentTokenSummary } from "@/lib/agentTokens";
import type { AgentAuditLogSummary } from "@/lib/agentAudit";

interface McpStatsGridProps {
  tokens: AgentTokenSummary[];
  logs: AgentAuditLogSummary[];
}

export function McpStatsGrid({ tokens, logs }: McpStatsGridProps) {
  const now = new Date();
  const activeTokens = tokens.filter(
    (t) => !t.revokedAt && (!t.expiresAt || new Date(t.expiresAt) > now),
  ).length;

  const totalCalls = logs.length;
  const okCalls = logs.filter((l) => l.verdict === "OK").length;
  const successRate = totalCalls > 0 ? Math.round((okCalls / totalCalls) * 100) : 100;

  const totalDuration = logs.reduce((acc, l) => acc + l.durationMs, 0);
  const avgLatency = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

  const stats = [
    {
      label: "Tokens Ativos",
      value: activeTokens.toString(),
      helper: `${tokens.length} gerados no total`,
      icon: KeyRound,
      color: "teal",
      badge: activeTokens > 0 ? "Operacional" : "Sem tokens",
      badgeColor: activeTokens > 0 ? "teal" : "gray",
    },
    {
      label: "Chamadas Registradas",
      value: totalCalls.toString(),
      helper: "Histórico das últimas 50 ações",
      icon: Activity,
      color: "blue",
      badge: "60 req/min",
      badgeColor: "blue",
    },
    {
      label: "Taxa de Sucesso",
      value: `${successRate}%`,
      helper: `${okCalls} de ${totalCalls || 0} veredictos OK`,
      icon: CheckCircle2,
      color: "green",
      badge: "Auditoria ativa",
      badgeColor: "green",
    },
    {
      label: "Latência Média",
      value: avgLatency > 0 ? `${avgLatency} ms` : "—",
      helper: "Tempo de resposta do gateway",
      icon: Gauge,
      color: "grape",
      badge: "HTTP SSE",
      badgeColor: "grape",
    },
  ];

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.label}
            withBorder
            radius="md"
            padding="md"
            style={{
              transition: "transform 180ms ease, box-shadow 180ms ease",
              "&:hover": {
                transform: "translateY(-2px)",
              },
            }}
          >
            <Stack gap="xs">
              <Group justify="space-between" align="flex-start">
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={0.5}>
                  {stat.label}
                </Text>
                <Badge variant="light" color={stat.badgeColor} size="xs">
                  {stat.badge}
                </Badge>
              </Group>

              <Group align="flex-end" justify="space-between">
                <div>
                  <Text fz={26} fw={700} lh={1}>
                    {stat.value}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {stat.helper}
                  </Text>
                </div>
                <ThemeIcon variant="light" color={stat.color} size="lg" radius="md">
                  <Icon size={18} aria-hidden />
                </ThemeIcon>
              </Group>
            </Stack>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}
