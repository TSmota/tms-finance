import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cronAuth";
import { AGENT_AUDIT_RETENTION_DAYS, pruneAgentAudit } from "@/lib/agentAudit";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  return NextResponse.json({
    deleted: await pruneAgentAudit(),
    retentionDays: AGENT_AUDIT_RETENTION_DAYS,
  });
}
