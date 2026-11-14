"use client";

import { Accordion, Badge, Card, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { BookOpen, ShieldAlert } from "lucide-react";

export function AgentScopesGuide() {
  const readTools = [
    "list_accounts",
    "list_transactions",
    "get_transaction",
    "get_month_summary",
    "get_balance_projection",
    "get_net_worth",
    "get_monthly_history",
    "list_credit_cards",
    "list_card_invoices",
    "get_invoice",
    "list_invoice_items",
    "get_open_invoices",
    "list_transfers",
    "list_savings_goals",
    "list_payables",
    "list_debts",
    "get_debt_detail",
    "get_debts_by_category",
    "list_people",
    "get_people_overview",
    "list_recurring",
    "list_pending_occurrences",
    "list_categories",
    "get_deletion_impact",
  ];

  const transactionTools = [
    "create_transaction",
    "update_transaction",
    "delete_transaction",
  ];

  const cardTools = [
    "create_credit_card",
    "update_credit_card",
    "create_card_purchase",
    "update_card_purchase",
    "delete_card_purchase",
    "pay_invoice",
    "undo_invoice_payment",
  ];

  const transferGoalTools = [
    "create_transfer",
    "update_transfer",
    "delete_transfer",
    "create_savings_goal",
    "update_savings_goal",
    "add_savings_entry",
  ];

  const debtTools = [
    "create_debt",
    "update_debt",
    "settle_debt",
    "delete_settlement",
  ];

  const recurringTools = [
    "create_recurring",
    "update_recurring",
    "delete_recurring",
    "set_recurring_active",
    "confirm_pending",
    "materialize_recurring",
  ];

  const setupTools = [
    "create_account",
    "update_account",
    "create_category",
    "update_category",
    "create_person",
    "update_person",
  ];

  const batchTools = ["pay_batch"];

  const destructiveTools = [
    "delete_account",
    "delete_credit_card",
    "delete_person",
    "delete_category",
    "delete_debt",
  ];

  const totalTools =
    readTools.length +
    transactionTools.length +
    cardTools.length +
    transferGoalTools.length +
    debtTools.length +
    recurringTools.length +
    setupTools.length +
    batchTools.length +
    destructiveTools.length;

  const renderToolBadges = (tools: string[]) => (
    <Group gap={6} wrap="wrap" mt={6}>
      {tools.map((tool) => (
        <Badge
          key={tool}
          variant="outline"
          color="gray"
          size="sm"
          style={{ fontFamily: "var(--font-geist-mono), monospace", textTransform: "none" }}
        >
          {tool}
        </Badge>
      ))}
    </Group>
  );

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
        <Group gap="sm" align="center">
          <ThemeIcon size={38} radius="md" variant="light" color="teal">
            <BookOpen size={20} aria-hidden />
          </ThemeIcon>
          <div>
            <Text fw={700} size="md">
              Inventário de Ferramentas por Escopo
            </Text>
            <Text size="xs" c="dimmed">
              Mapeamento estrito das {totalTools} ferramentas do protocolo MCP e suas restrições operacionais
            </Text>
          </div>
        </Group>

        <Accordion variant="separated" radius="md">
          <Accordion.Item value="read">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="blue" variant="light">
                  finance:read
                </Badge>
                <Text size="sm" fw={600}>
                  Leitura completa de dados financeiros ({readTools.length} ferramentas)
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Permite ao agente consultar saldos, relatórios, projeções, transações e cadastros, sem permissão de alteração:
              </Text>
              {renderToolBadges(readTools)}
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="transactions">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  transactions:write
                </Badge>
                <Text size="sm" fw={600}>
                  Transações em contas bancárias ({transactionTools.length} ferramentas)
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Lançar receitas, despesas e ajustes de saldo em contas e dinheiro físico:
              </Text>
              {renderToolBadges(transactionTools)}
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="cards">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  cards:write & invoices:pay
                </Badge>
                <Text size="sm" fw={600}>
                  Cartões de crédito e faturas ({cardTools.length} ferramentas)
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Criar/editar cartões, lançar compras à vista ou parceladas e registrar quitação de faturas:
              </Text>
              {renderToolBadges(cardTools)}
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="setup">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  setup:write
                </Badge>
                <Text size="sm" fw={600}>
                  Cadastros de base ({setupTools.length} ferramentas)
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Criar e editar contas bancárias, categorias e pessoas de contato:
              </Text>
              {renderToolBadges(setupTools)}
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="transfers_goals">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  transfers:write & goals:write
                </Badge>
                <Text size="sm" fw={600}>
                  Transferências e metas de economia ({transferGoalTools.length} ferramentas)
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Movimentações entre contas do usuário e depósitos em metas de poupança:
              </Text>
              {renderToolBadges(transferGoalTools)}
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="debts">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  debts:write
                </Badge>
                <Text size="sm" fw={600}>
                  Dívidas e amortizações ({debtTools.length} ferramentas)
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Controle de empréstimos, financiamentos e amortizações com recálculo automático de saldo devedor:
              </Text>
              {renderToolBadges(debtTools)}
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="recurring">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  recurring:write
                </Badge>
                <Text size="sm" fw={600}>
                  Recorrências e materialização ({recurringTools.length} ferramentas)
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Gerenciar gastos recorrentes, confirmar pendências e materializar ocorrências do mês:
              </Text>
              {renderToolBadges(recurringTools)}
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="batch">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  payments:write
                </Badge>
                <Text size="sm" fw={600}>
                  Pagamentos em lote ({batchTools.length} ferramenta)
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Quitação atômica de múltiplos compromissos financeiros pendentes em uma única transação:
              </Text>
              {renderToolBadges(batchTools)}
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="destructive">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="red" variant="filled">
                  destructive:write
                </Badge>
                <Text size="sm" fw={600}>
                  Exclusões estruturais com impacto em cascata ({destructiveTools.length} ferramentas)
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Group gap={6} mb="xs">
                <ShieldAlert size={14} color="var(--mantine-color-red-6)" aria-hidden />
                <Text size="xs" c="red.6" fw={600}>
                  Exige escopo explícito e elicitação de confirmação humana em duas fases no cliente MCP:
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mb="xs">
                Apagar entidades estruturais exige consulta prévia de impacto (<code>get_deletion_impact</code>) e validação manual do usuário:
              </Text>
              {renderToolBadges(destructiveTools)}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Card>
  );
}
