import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { recordAgentCall } from "@/lib/agentAudit";
import { checkAgentRateLimit } from "@/lib/agentRateLimit";
import { listCategoryTree } from "@/lib/categories";
import { noArgs } from "@/mcp/args";
import { runTool } from "@/mcp/guard";
import { makeUser } from "../factories";
import { auditFor, ctxFor, makeAgent } from "../mcpHarness";
import { readResult } from "../mcpHarness";

/**
 * Cota por token, contada em SQL sobre a trilha de auditoria.
 *
 * O que isto protege é loop desgovernado do agente, não fraude — o token já é a
 * autenticação. A contagem vive no Postgres e não em memória porque o Fluid
 * Compute reusa instâncias mas não garante que duas chamadas caiam na mesma: um
 * bucket em processo contaria cada instância separadamente e o limite real seria
 * N vezes o configurado, o que é pior que não ter limite, porque parece ter.
 */
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

beforeEach(() => {
  vi.unstubAllEnvs();
});

/** Preenche a janela sem gastar chamadas de ferramenta de verdade. */
async function fillWindow(tokenId: string, userId: string, count: number, at: Date) {
  for (let i = 0; i < count; i += 1) {
    await recordAgentCall({
      tokenId,
      userId,
      tool: "list_categories",
      verdict: "OK",
      args: {},
      durationMs: 1,
    });
  }

  await prisma.agentAuditLog.updateMany({
    where: { tokenId },
    data: { createdAt: at },
  });
}

describe("janela deslizante", () => {
  it("conta só as chamadas do último minuto", async () => {
    const user = await makeUser();
    const agent = await makeAgent(user.id, ["finance:read"]);
    const now = new Date("2026-08-21T12:00:00Z");

    // Dentro da janela.
    await fillWindow(agent.tokenId, user.id, 3, new Date("2026-08-21T11:59:30Z"));

    expect(await checkAgentRateLimit(agent.tokenId, now)).toMatchObject({
      allowed: true,
      used: 3,
    });

    // Empurradas para fora: a janela é deslizante, não um balde que enche.
    await prisma.agentAuditLog.updateMany({
      where: { tokenId: agent.tokenId },
      data: { createdAt: new Date("2026-08-21T11:58:00Z") },
    });

    expect(await checkAgentRateLimit(agent.tokenId, now)).toMatchObject({
      allowed: true,
      used: 0,
    });
  });

  it("nega ao atingir o limite, e conta por token — não por usuário", async () => {
    const user = await makeUser();
    const first = await makeAgent(user.id, ["finance:read"]);
    const second = await makeAgent(user.id, ["finance:read"]);
    const now = new Date("2026-08-21T12:00:00Z");

    vi.stubEnv("AGENT_RATE_LIMIT_PER_MINUTE", "5");

    await fillWindow(first.tokenId, user.id, 5, new Date("2026-08-21T11:59:50Z"));

    expect(await checkAgentRateLimit(first.tokenId, now)).toMatchObject({
      allowed: false,
      used: 5,
      limit: 5,
    });

    // O segundo token do mesmo usuário não herda a cota do primeiro.
    expect(await checkAgentRateLimit(second.tokenId, now)).toMatchObject({
      allowed: true,
      used: 0,
    });
  });

  it("cai no default quando a variável é lixo, em vez de desligar o limite", async () => {
    const user = await makeUser();
    const agent = await makeAgent(user.id, ["finance:read"]);

    // `Number.parseInt("abc")` é NaN, e toda comparação com NaN é falsa: sem a
    // guarda, o limite deixaria de existir silenciosamente.
    vi.stubEnv("AGENT_RATE_LIMIT_PER_MINUTE", "abc");

    expect((await checkAgentRateLimit(agent.tokenId)).limit).toBe(60);

    vi.stubEnv("AGENT_RATE_LIMIT_PER_MINUTE", "0");

    expect((await checkAgentRateLimit(agent.tokenId)).limit).toBe(60);
  });
});

describe("no guard", () => {
  it("recusa a ferramenta com rate_limited e registra o veredito", async () => {
    const user = await makeUser();
    const agent = await makeAgent(user.id, ["finance:read"]);

    vi.stubEnv("AGENT_RATE_LIMIT_PER_MINUTE", "2");

    const call = () =>
      runTool({
        ctx: ctxFor(agent, "BRL"),
        tool: "list_categories",
        input: {},
        schema: noArgs,
        run: (a) => listCategoryTree(a.userId),
        serialize: (rows) => rows,
      });

    expect(readResult(await call()).ok).toBe(true);
    expect(readResult(await call()).ok).toBe(true);

    // A terceira cai: as duas primeiras já preencheram a janela.
    const third = readResult(await call());

    expect(third.code).toBe("rate_limited");
    expect(String(third.message)).toContain("2 chamadas por minuto");

    const verdicts = (await auditFor("list_categories")).map((row) => row.verdict);

    expect(verdicts).toEqual(["OK", "OK", "RATE_LIMITED"]);
  });
});
