"use client";

import { Accordion, Badge, Card, Group, Stack, Text } from "@mantine/core";
import { Shield, BookOpen } from "lucide-react";

export function AgentScopesGuide() {
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Group gap="xs">
          <BookOpen size={18} color="var(--mantine-color-teal-6)" aria-hidden />
          <div>
            <Text fw={600} size="md">
              Guia de Escopos e Ferramentas MCP
            </Text>
            <Text size="sm" c="dimmed">
              Entenda quais ferramentas e operações cada escopo disponibiliza para o seu agente
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
                <Text size="sm" fw={500}>
                  Leitura completa de dados financeiros
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Permite ao agente consultar saldos, relatórios, projeções e cadastros, sem nenhuma permissão de alteração:
              </Text>
              <Text size="xs" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
                list_accounts · list_transactions · get_month_summary · get_balance_projection · get_net_worth · get_monthly_history · list_credit_cards · list_card_invoices · list_invoice_items · get_open_invoices · list_transfers · list_savings_goals · list_payables · list_debts · get_debt_detail · get_people_overview · list_recurring · list_pending_occurrences · list_categories · get_deletion_impact
              </Text>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="transactions">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  transactions:write
                </Badge>
                <Text size="sm" fw={500}>
                  Transações em contas bancárias
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Criar, editar e apagar lançamentos em contas e dinheiro físico:
              </Text>
              <Text size="xs" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
                create_transaction · update_transaction · delete_transaction
              </Text>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="cards">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  cards:write & invoices:pay
                </Badge>
                <Text size="sm" fw={500}>
                  Cartões de crédito e pagamento de faturas
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Lançar compras à vista ou parceladas e gerenciar quitação de faturas:
              </Text>
              <Text size="xs" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
                create_card_purchase · update_card_purchase · delete_card_purchase · pay_invoice · undo_invoice_payment
              </Text>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="transfers_goals">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  transfers:write & goals:write
                </Badge>
                <Text size="sm" fw={500}>
                  Transferências e metas de economia
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Movimentações entre contas na mesma moeda e acompanhamento de metas financeiras:
              </Text>
              <Text size="xs" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
                create_transfer · update_transfer · delete_transfer · create_savings_goal · update_savings_goal · add_savings_entry
              </Text>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="payments_debts">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  payments:write & debts:write
                </Badge>
                <Text size="sm" fw={500}>
                  Pagamentos em lote e controle de dívidas
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Quitações em lote com chave de idempotência e empréstimos/dívidas com amortizações:
              </Text>
              <Text size="xs" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
                pay_batch · create_debt · update_debt · settle_debt · delete_settlement
              </Text>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="recurring_setup">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="cyan" variant="light">
                  recurring:write & setup:write
                </Badge>
                <Text size="sm" fw={500}>
                  Despesas recorrentes, categorias e pessoas
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" c="dimmed" mb="xs">
                Regras periódicas de despesa e cadastros de base que não fixam moeda:
              </Text>
              <Text size="xs" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
                create_recurring · update_recurring · delete_recurring · set_recurring_active · confirm_pending · materialize_recurring · create_category · update_category · create_person · update_person
              </Text>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="destructive">
            <Accordion.Control>
              <Group gap="xs">
                <Badge color="red" variant="light">
                  destructive:write
                </Badge>
                <Text size="sm" fw={500}>
                  Exclusões em cascata com confirmação em 2 fases
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Group gap="xs" mb="xs">
                <Shield size={16} color="var(--mantine-color-red-6)" aria-hidden />
                <Text size="xs" fw={600}>
                  Sempre exige confirmação humana através do protocolo de elicitação do MCP.
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mb="xs">
                A primeira chamada mede o impacto real (número de transações ou faturas afetadas). A remoção só é consumada se o cliente confirmar dentro de 120 segundos com assinatura de integridade válida:
              </Text>
              <Text size="xs" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
                delete_account · delete_credit_card · delete_person · delete_category · delete_debt
              </Text>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Card>
  );
}
