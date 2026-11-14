"use client";

import { useState, useSyncExternalStore } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  CopyButton,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { AlertTriangle, Check, Copy, KeyRound, Plus, ShieldAlert } from "lucide-react";

import { mintAgentToken } from "@/actions/agentTokens";
import { AGENT_SCOPES, type AgentScope } from "@/lib/agentScopes";
import type { MintedAgentToken } from "@/lib/agentTokens";

interface ScopeDefinition {
  scope: AgentScope;
  label: string;
  description: string;
}

const READ_SCOPES: ScopeDefinition[] = [
  {
    scope: "finance:read",
    label: "Leitura financeira geral",
    description: "Consultar saldos, contas, cartões, faturas, transações, dívidas, metas e relatórios.",
  },
];

const WRITE_FINANCIAL_SCOPES: ScopeDefinition[] = [
  {
    scope: "transactions:write",
    label: "Lançamentos e transações",
    description: "Criar e editar receitas e despesas de contas correntes ou dinheiro.",
  },
  {
    scope: "transfers:write",
    label: "Transferências entre contas",
    description: "Registrar transferências atômicas entre contas na mesma moeda.",
  },
  {
    scope: "goals:write",
    label: "Metas de economia",
    description: "Criar objetivos de poupança e registrar aportes ou retiradas.",
  },
  {
    scope: "cards:write",
    label: "Compras no cartão",
    description: "Registrar compras à vista ou parceladas no cartão de crédito.",
  },
  {
    scope: "invoices:pay",
    label: "Faturas de cartão",
    description: "Efetuar pagamento e desfazer quitações de faturas.",
  },
  {
    scope: "payments:write",
    label: "Pagamentos em lote",
    description: "Quitar múltiplas faturas e dívidas em uma única transação atômica.",
  },
  {
    scope: "debts:write",
    label: "Dívidas e empréstimos",
    description: "Criar dívidas com pessoas e registrar amortizações parciais ou totais.",
  },
  {
    scope: "recurring:write",
    label: "Despesas recorrentes",
    description: "Gerenciar regras de recorrência e confirmar ocorrências pendentes.",
  },
];

const SETUP_SCOPES: ScopeDefinition[] = [
  {
    scope: "setup:write",
    label: "Cadastros de base",
    description: "Criar e editar categorias e contatos de pessoas (cadastros sem moeda).",
  },
];

const DESTRUCTIVE_SCOPES: ScopeDefinition[] = [
  {
    scope: "destructive:write",
    label: "Exclusão em cascata",
    description: "Remover contas, cartões, categorias, pessoas e dívidas. Sempre exige confirmação em 2 fases.",
  },
];

const PRESETS: Array<{ name: string; scopes: AgentScope[] }> = [
  {
    name: "Somente leitura",
    scopes: ["finance:read"],
  },
  {
    name: "Operação padrão",
    scopes: [
      "finance:read",
      "transactions:write",
      "transfers:write",
      "goals:write",
      "cards:write",
      "invoices:pay",
      "recurring:write",
    ],
  },
  {
    name: "Completo (sem exclusões)",
    scopes: [
      "finance:read",
      "transactions:write",
      "transfers:write",
      "goals:write",
      "cards:write",
      "invoices:pay",
      "payments:write",
      "debts:write",
      "recurring:write",
      "setup:write",
    ],
  },
  {
    name: "Acesso total",
    scopes: [...AGENT_SCOPES],
  },
];

export function MintAgentTokenButton() {
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<AgentScope[]>([
    "finance:read",
    "transactions:write",
    "transfers:write",
    "goals:write",
    "cards:write",
    "invoices:pay",
    "recurring:write",
  ]);
  const [expiresInDays, setExpiresInDays] = useState<string>("none");
  const [mintedResult, setMintedResult] = useState<MintedAgentToken | null>(null);
  const clientOrigin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "http://localhost:3000",
  );

  const handleScopeToggle = (scope: AgentScope, checked: boolean) => {
    if (checked) {
      setSelectedScopes((current) => [...current, scope]);
    } else {
      setSelectedScopes((current) => current.filter((s) => s !== scope));
    }
  };

  const handleApplyPreset = (scopes: AgentScope[]) => {
    setSelectedScopes([...scopes]);
  };

  const resetForm = () => {
    setLabel("");
    setSelectedScopes([
      "finance:read",
      "transactions:write",
      "transfers:write",
      "goals:write",
      "cards:write",
      "invoices:pay",
      "recurring:write",
    ]);
    setExpiresInDays("none");
    setMintedResult(null);
  };

  const handleModalClose = () => {
    resetForm();
    close();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!label.trim()) {
      notifications.show({ color: "red", message: "Informe um rótulo para o agente" });
      return;
    }

    if (selectedScopes.length === 0) {
      notifications.show({ color: "red", message: "Selecione pelo menos um escopo de permissão" });
      return;
    }

    setLoading(true);

    try {
      const parsedDays = expiresInDays === "none" ? null : Number(expiresInDays);

      const result = await mintAgentToken({
        label: label.trim(),
        scopes: selectedScopes,
        expiresInDays: parsedDays,
      });

      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });
        return;
      }

      setMintedResult(result.data);
      notifications.show({ color: "teal", message: "Token de agente emitido com sucesso!" });
    } catch (error) {
      console.error("Falha ao emitir token de agente:", error);
      notifications.show({ color: "red", message: "Ocorreu um erro ao emitir o token." });
    } finally {
      setLoading(false);
    }
  };

  const mcpConfigSnippet = mintedResult
    ? JSON.stringify(
        {
          mcpServers: {
            "tms-finance": {
              url: `${clientOrigin}/api/agent/mcp`,
              headers: {
                Authorization: `Bearer ${mintedResult.token}`,
              },
            },
          },
        },
        null,
        2,
      )
    : "";

  return (
    <>
      <Button leftSection={<Plus size={16} aria-hidden />} onClick={open}>
        Nova conexão
      </Button>

      <Modal
        opened={opened}
        onClose={handleModalClose}
        title={
          <Group gap="xs">
            <KeyRound size={20} color="var(--mantine-color-teal-6)" aria-hidden />
            <Text fw={600}>
              {mintedResult ? "Conexão MCP criada" : "Nova conexão de agente MCP"}
            </Text>
          </Group>
        }
        size="lg"
        centered
      >
        {mintedResult ? (
          <Stack gap="md">
            <Alert
              color="yellow"
              title="Guarde este token em local seguro"
              icon={<AlertTriangle size={18} aria-hidden />}
            >
              Por motivos de segurança, o segredo completo do token é exibido apenas agora e{" "}
              <strong>não poderá ser recuperado posteriormente</strong>. Copie e configure em seu
              agente antes de fechar esta janela.
            </Alert>

            <div>
              <Text size="sm" fw={600} mb={4}>
                Token de acesso ({mintedResult.label})
              </Text>
              <Group gap="xs" wrap="nowrap">
                <TextInput
                  value={mintedResult.token}
                  readOnly
                  style={{ flex: 1 }}
                  aria-label="Token de acesso gerado"
                />
                <CopyButton value={mintedResult.token} timeout={2500}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? "Copiado!" : "Copiar token"} withArrow>
                      <Button
                        color={copied ? "teal" : "blue"}
                        onClick={copy}
                        leftSection={copied ? <Check size={16} /> : <Copy size={16} />}
                      >
                        {copied ? "Copiado" : "Copiar"}
                      </Button>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
            </div>

            <div>
              <Text size="sm" fw={600} mb={4}>
                Configuração para clientes MCP (Gemini CLI / Antigravity, Cursor, Claude Desktop)
              </Text>
              <Text size="xs" c="dimmed" mb="xs">
                Copie o trecho abaixo e cole no arquivo de configuração do seu cliente MCP (ex: <code>~/.gemini/config/mcp_config.json</code> ou <code>.cursor/mcp.json</code>):
              </Text>
              <Stack gap="xs">
                <pre
                  tabIndex={0}
                  role="region"
                  aria-label="Snippet de configuração MCP"
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
                        variant="light"
                        color={copied ? "teal" : "gray"}
                        size="xs"
                        leftSection={copied ? <Check size={14} /> : <Copy size={14} />}
                        onClick={copy}
                      >
                        {copied ? "Configuração copiada!" : "Copiar JSON de configuração"}
                      </Button>
                    )}
                  </CopyButton>
                </Group>
              </Stack>
            </div>

            <Group gap="xs" mt="xs">
              <Badge variant="light" color="teal">
                Rótulo: {mintedResult.label}
              </Badge>
              <Badge variant="light" color="blue">
                {mintedResult.scopes.length} escopos ativos
              </Badge>
              <Badge variant="light" color="gray">
                {mintedResult.expiresAt
                  ? `Expira em ${new Date(mintedResult.expiresAt).toLocaleDateString("pt-BR")}`
                  : "Sem expiração"}
              </Badge>
            </Group>

            <Divider my="sm" />

            <Group justify="flex-end">
              <Button onClick={handleModalClose}>Concluir e fechar</Button>
            </Group>
          </Stack>
        ) : (
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Rótulo da credencial"
                description="Identifique quem utilizará esta conexão (ex.: 'Claude Desktop', 'Hermes Produção', 'Cursor')"
                placeholder="Ex: Claude Desktop"
                value={label}
                onChange={(e) => setLabel(e.currentTarget.value)}
                required
              />

              <Select
                label="Validade do token"
                description="Período após o qual o token perderá o acesso automaticamente"
                value={expiresInDays}
                onChange={(val) => setExpiresInDays(val ?? "none")}
                data={[
                  { value: "none", label: "Sem expiração (recomendado para uso local)" },
                  { value: "30", label: "30 dias" },
                  { value: "60", label: "60 dias" },
                  { value: "90", label: "90 dias" },
                  { value: "180", label: "180 dias" },
                  { value: "365", label: "1 ano (365 dias)" },
                ]}
              />

              <div>
                <Group justify="space-between" align="center" mb="xs">
                  <div>
                    <Text size="sm" fw={600}>
                      Escopos de permissão
                    </Text>
                    <Text size="xs" c="dimmed">
                      Defina o que o agente está autorizado a consultar e operar
                    </Text>
                  </div>
                </Group>

                <Stack gap="xs" mb="md">
                  <Text size="xs" fw={500} c="dimmed">
                    Modelos rápidos de permissão:
                  </Text>
                  <Group gap={6}>
                    {PRESETS.map((preset) => (
                      <Button
                        key={preset.name}
                        variant="light"
                        color="gray"
                        size="xs"
                        onClick={() => handleApplyPreset(preset.scopes)}
                      >
                        {preset.name}
                      </Button>
                    ))}
                  </Group>
                </Stack>

                <Stack gap="md">
                  <div>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>
                      Leitura e Consultas
                    </Text>
                    <Stack gap="xs">
                      {READ_SCOPES.map(({ scope, label: scopeLabel, description }) => (
                        <Checkbox
                          key={scope}
                          label={
                            <div>
                              <Group gap="xs">
                                <Text size="sm" fw={500}>
                                  {scopeLabel}
                                </Text>
                                <Badge size="xs" variant="outline" color="blue">
                                  {scope}
                                </Badge>
                              </Group>
                              <Text size="xs" c="dimmed">
                                {description}
                              </Text>
                            </div>
                          }
                          checked={selectedScopes.includes(scope)}
                          onChange={(e) => handleScopeToggle(scope, e.currentTarget.checked)}
                        />
                      ))}
                    </Stack>
                  </div>

                  <Divider />

                  <div>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>
                      Operações Financeiras (Escrita)
                    </Text>
                    <Stack gap="xs">
                      {WRITE_FINANCIAL_SCOPES.map(({ scope, label: scopeLabel, description }) => (
                        <Checkbox
                          key={scope}
                          label={
                            <div>
                              <Group gap="xs">
                                <Text size="sm" fw={500}>
                                  {scopeLabel}
                                </Text>
                                <Badge size="xs" variant="outline" color="teal">
                                  {scope}
                                </Badge>
                              </Group>
                              <Text size="xs" c="dimmed">
                                {description}
                              </Text>
                            </div>
                          }
                          checked={selectedScopes.includes(scope)}
                          onChange={(e) => handleScopeToggle(scope, e.currentTarget.checked)}
                        />
                      ))}
                    </Stack>
                  </div>

                  <Divider />

                  <div>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>
                      Cadastros de Base
                    </Text>
                    <Stack gap="xs">
                      {SETUP_SCOPES.map(({ scope, label: scopeLabel, description }) => (
                        <Checkbox
                          key={scope}
                          label={
                            <div>
                              <Group gap="xs">
                                <Text size="sm" fw={500}>
                                  {scopeLabel}
                                </Text>
                                <Badge size="xs" variant="outline" color="cyan">
                                  {scope}
                                </Badge>
                              </Group>
                              <Text size="xs" c="dimmed">
                                {description}
                              </Text>
                            </div>
                          }
                          checked={selectedScopes.includes(scope)}
                          onChange={(e) => handleScopeToggle(scope, e.currentTarget.checked)}
                        />
                      ))}
                    </Stack>
                  </div>

                  <Divider />

                  <div>
                    <Group gap="xs" mb={6}>
                      <ShieldAlert size={14} color="var(--mantine-color-red-6)" aria-hidden />
                      <Text size="xs" fw={700} tt="uppercase">
                        Ações Destrutivas
                      </Text>
                    </Group>
                    <Stack gap="xs">
                      {DESTRUCTIVE_SCOPES.map(({ scope, label: scopeLabel, description }) => (
                        <Checkbox
                          key={scope}
                          color="red"
                          label={
                            <div>
                              <Group gap="xs">
                                <Text size="sm" fw={500}>
                                  {scopeLabel}
                                </Text>
                                <Badge size="xs" variant="outline" color="red">
                                  {scope}
                                </Badge>
                              </Group>
                              <Text size="xs" c="dimmed">
                                {description}
                              </Text>
                            </div>
                          }
                          checked={selectedScopes.includes(scope)}
                          onChange={(e) => handleScopeToggle(scope, e.currentTarget.checked)}
                        />
                      ))}
                    </Stack>
                  </div>
                </Stack>
              </div>

              <Divider my="xs" />

              <Group justify="flex-end">
                <Button variant="default" onClick={handleModalClose}>
                  Cancelar
                </Button>
                <Button type="submit" loading={loading}>
                  Emitir token
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>
    </>
  );
}
