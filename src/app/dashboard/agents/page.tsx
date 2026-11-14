import { Stack } from "@mantine/core";

import { requireUser } from "@/lib/session";
import { listAgentTokens } from "@/lib/agentTokens";
import { listAgentAuditLogs } from "@/lib/agentAudit";
import { PageHeader } from "@/components/ui/PageHeader";
import { MintAgentTokenButton } from "@/components/forms/MintAgentTokenButton";
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
        subtitle="Gerencie tokens de acesso e monitore a integração dos seus agentes de IA com o TMS Finance via Model Context Protocol"
        action={<MintAgentTokenButton />}
      />

      <McpEndpointCard />

      <AgentTokensTable tokens={tokens} />

      <AgentAuditTable logs={auditLogs} />

      <AgentScopesGuide />
    </Stack>
  );
}
