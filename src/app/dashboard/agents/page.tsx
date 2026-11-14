import { Stack } from "@mantine/core";

import { requireUser } from "@/lib/session";
import { listAgentTokens } from "@/lib/agentTokens";
import { listAgentAuditLogs } from "@/lib/agentAudit";
import { PageHeader } from "@/components/ui/PageHeader";
import { MintAgentTokenButton } from "@/components/forms/MintAgentTokenButton";
import { McpStatsGrid } from "@/components/ui/McpStatsGrid";
import { McpFlowVisual } from "@/components/ui/McpFlowVisual";
import { McpEndpointCard } from "@/components/ui/McpEndpointCard";
import { AgentTokensTable } from "@/components/ui/AgentTokensTable";
import { AgentAuditTable } from "@/components/ui/AgentAuditTable";
import { AgentScopesGuide } from "@/components/ui/AgentScopesGuide";

export const metadata = {
  title: "Conexões MCP dos Agentes — TMS Finance",
};

export default async function AgentsPage() {
  const user = await requireUser();

  const [tokens, auditLogs] = await Promise.all([
    listAgentTokens(user.id),
    listAgentAuditLogs(user.id, { limit: 50 }),
  ]);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Conexões MCP dos Agentes"
        subtitle="Gateway de integração segura para agentes de IA operarem o livro-razão financeiro via Model Context Protocol."
        action={<MintAgentTokenButton />}
      />

      <McpStatsGrid tokens={tokens} logs={auditLogs} />

      <McpFlowVisual />

      <McpEndpointCard />

      <AgentTokensTable tokens={tokens} />

      <AgentAuditTable logs={auditLogs} />

      <AgentScopesGuide />
    </Stack>
  );
}
