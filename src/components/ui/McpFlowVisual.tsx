"use client";

import { Card, Group, Stack, Text, Badge, Box } from "@mantine/core";
import { Cpu, ShieldCheck, Zap, History } from "lucide-react";

export function McpFlowVisual() {
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
        <Group justify="space-between" align="center" wrap="wrap">
          <div>
            <Group gap="xs">
              <Zap size={18} color="var(--mantine-color-teal-6)" aria-hidden />
              <Text fw={700} size="sm" tt="uppercase" lts={1}>
                Pipeline de Execução em Tempo Real
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              Fluxo autenticado de handshake, inspeção de escopos, confirmação em duas fases e livro-razão
            </Text>
          </div>
          <Group gap="xs">
            <Badge variant="dot" color="teal" size="sm">
              Streamable SSE
            </Badge>
            <Badge variant="outline" color="gray" size="sm">
              Ciclo 3.2s
            </Badge>
          </Group>
        </Group>

        {/* Responsive SVG Architecture Diagram with pulsating pulse */}
        <Box
          style={{
            position: "relative",
            width: "100%",
            borderRadius: "var(--mantine-radius-md)",
            border: "1px solid var(--mantine-color-default-border)",
            background: "var(--mantine-color-default-hover)",
            overflow: "hidden",
            padding: "16px 8px",
          }}
        >
          <svg
            viewBox="0 0 880 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: "100%", height: "auto", display: "block" }}
            role="img"
            aria-label="Diagrama de arquitetura da conexão MCP mostrando o fluxo de autenticação, gateway, livro-razão e auditoria"
          >
            <style>
              {`
                @keyframes pulsePath {
                  0% { stroke-dashoffset: 120; opacity: 0.1; }
                  20% { opacity: 0.9; }
                  80% { opacity: 0.9; }
                  100% { stroke-dashoffset: -120; opacity: 0.1; }
                }
                .flow-pulse {
                  stroke: var(--mantine-color-teal-5);
                  stroke-width: 2.5;
                  stroke-linecap: round;
                  stroke-dasharray: 24 96;
                  animation: pulsePath 3.2s linear infinite;
                }
                @media (prefers-reduced-motion: reduce) {
                  .flow-pulse {
                    animation: none;
                    stroke-dasharray: none;
                    opacity: 0.5;
                  }
                }
              `}
            </style>

            {/* Base connection lines */}
            <path
              d="M 180 100 L 260 100"
              stroke="var(--mantine-color-default-border)"
              strokeWidth="2"
            />
            <path
              d="M 440 100 L 520 100"
              stroke="var(--mantine-color-default-border)"
              strokeWidth="2"
            />
            <path
              d="M 700 100 L 760 100"
              stroke="var(--mantine-color-default-border)"
              strokeWidth="2"
            />

            {/* Pulsing signal lines */}
            <path d="M 180 100 L 260 100" className="flow-pulse" />
            <path d="M 440 100 L 520 100" className="flow-pulse" style={{ animationDelay: "0.8s" }} />
            <path d="M 700 100 L 760 100" className="flow-pulse" style={{ animationDelay: "1.6s" }} />

            {/* Step 1: Clients */}
            <g transform="translate(10, 35)">
              <rect
                width="170"
                height="130"
                rx="8"
                fill="var(--mantine-color-body)"
                stroke="var(--mantine-color-default-border)"
                strokeWidth="1.5"
              />
              <circle cx="28" cy="28" r="12" fill="var(--mantine-color-blue-light)" />
              <text x="28" y="32" textAnchor="middle" fill="var(--mantine-color-blue-filled)" fontSize="11" fontWeight="700">AI</text>
              <text x="48" y="32" fill="var(--mantine-color-text)" fontSize="13" fontWeight="700">
                Assistentes IA
              </text>
              <text x="20" y="60" fill="var(--mantine-color-dimmed)" fontSize="11">
                • Claude Desktop
              </text>
              <text x="20" y="78" fill="var(--mantine-color-dimmed)" fontSize="11">
                • Cursor & Gemini CLI
              </text>
              <text x="20" y="96" fill="var(--mantine-color-dimmed)" fontSize="11">
                • OpenCode & CLI
              </text>
              <text x="20" y="118" fill="var(--mantine-color-blue-6)" fontSize="10" fontWeight="600">
                Bearer hermes_live_***
              </text>
            </g>

            {/* Step 2: Gateway */}
            <g transform="translate(260, 35)">
              <rect
                width="180"
                height="130"
                rx="8"
                fill="var(--mantine-color-body)"
                stroke="var(--mantine-color-teal-6)"
                strokeWidth="1.5"
              />
              <circle cx="28" cy="28" r="12" fill="var(--mantine-color-teal-light)" />
              <text x="28" y="32" textAnchor="middle" fill="var(--mantine-color-teal-filled)" fontSize="11" fontWeight="700">✓</text>
              <text x="48" y="32" fill="var(--mantine-color-text)" fontSize="13" fontWeight="700">
                Gateway MCP
              </text>
              <text x="20" y="60" fill="var(--mantine-color-dimmed)" fontSize="11">
                • /api/agent/mcp
              </text>
              <text x="20" y="78" fill="var(--mantine-color-dimmed)" fontSize="11">
                • HMAC-SHA256 + Pepper
              </text>
              <text x="20" y="96" fill="var(--mantine-color-dimmed)" fontSize="11">
                • Sliding Rate Limit
              </text>
              <text x="20" y="118" fill="var(--mantine-color-teal-6)" fontSize="10" fontWeight="600">
                Janela de 60 req/min
              </text>
            </g>

            {/* Step 3: Engine */}
            <g transform="translate(520, 35)">
              <rect
                width="180"
                height="130"
                rx="8"
                fill="var(--mantine-color-body)"
                stroke="var(--mantine-color-default-border)"
                strokeWidth="1.5"
              />
              <circle cx="28" cy="28" r="12" fill="var(--mantine-color-violet-light)" />
              <text x="28" y="32" textAnchor="middle" fill="var(--mantine-color-violet-filled)" fontSize="11" fontWeight="700">⚙</text>
              <text x="48" y="32" fill="var(--mantine-color-text)" fontSize="13" fontWeight="700">
                Motor TMS Finance
              </text>
              <text x="20" y="60" fill="var(--mantine-color-dimmed)" fontSize="11">
                • Verificação de Escopo
              </text>
              <text x="20" y="78" fill="var(--mantine-color-dimmed)" fontSize="11">
                • Elicitação em 2 Fases
              </text>
              <text x="20" y="96" fill="var(--mantine-color-dimmed)" fontSize="11">
                • Validação Zod Rígida
              </text>
              <text x="20" y="118" fill="var(--mantine-color-violet-6)" fontSize="10" fontWeight="600">
                Transações Atômicas
              </text>
            </g>

            {/* Step 4: Ledger & Audit */}
            <g transform="translate(760, 35)">
              <rect
                width="110"
                height="130"
                rx="8"
                fill="var(--mantine-color-body)"
                stroke="var(--mantine-color-default-border)"
                strokeWidth="1.5"
              />
              <circle cx="24" cy="28" r="12" fill="var(--mantine-color-grape-light)" />
              <text x="24" y="32" textAnchor="middle" fill="var(--mantine-color-grape-filled)" fontSize="11" fontWeight="700">DB</text>
              <text x="44" y="32" fill="var(--mantine-color-text)" fontSize="12" fontWeight="700">
                Postgres
              </text>
              <text x="14" y="65" fill="var(--mantine-color-dimmed)" fontSize="10">
                Livro-Razão
              </text>
              <text x="14" y="85" fill="var(--mantine-color-dimmed)" fontSize="10">
                Auditoria 90d
              </text>
              <text x="14" y="118" fill="var(--mantine-color-teal-6)" fontSize="10" fontWeight="600">
                AuditLog
              </text>
            </g>
          </svg>
        </Box>

        {/* Micro-guide bar */}
        <Group justify="space-between" align="center" wrap="wrap">
          <Group gap="md">
            <Group gap={6}>
              <ShieldCheck size={14} color="var(--mantine-color-teal-6)" aria-hidden />
              <Text size="xs" c="dimmed">
                Proteção criptográfica contra timing attacks e impersonação
              </Text>
            </Group>
            <Group gap={6}>
              <Cpu size={14} color="var(--mantine-color-blue-6)" aria-hidden />
              <Text size="xs" c="dimmed">
                Ferramentas destrutivas exigem confirmação explícita do usuário
              </Text>
            </Group>
          </Group>
          <Group gap={6}>
            <History size={14} color="var(--mantine-color-dimmed)" aria-hidden />
            <Text size="xs" c="dimmed">
              Sanitização estrita de PII nos logs
            </Text>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}
