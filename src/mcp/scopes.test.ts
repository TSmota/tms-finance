import { describe, expect, it } from "vitest";

import { AGENT_SCOPES, isAgentScope } from "@/lib/agentScopes";
import {
  DESTRUCTIVE_TOOLS,
  READ_TOOLS,
  TOOL_SCOPES,
  WRITE_TOOLS,
  scopeForTool,
} from "@/mcp/scopes";

/**
 * Este arquivo trava o vocabulário de escopos; quem trava a existência das
 * ferramentas é `tests/integration/mcpRegistry.test.ts`.
 *
 * A divisão não é arbitrária: as listas daqui são a única fonte que este teste
 * conhece, então ele não consegue ver uma ferramenta registrada e esquecida no
 * mapa. Para isso é preciso importar `registerTools`, e com ele o Prisma.
 *
 * O `runTool` falha fechado quando `scopeForTool` devolve `undefined`, então uma
 * ferramenta esquecida não roda aberta — ela simplesmente não funciona. Isso é o
 * comportamento seguro, mas é um bug silencioso.
 */

describe("mapa de escopos", () => {
  it("declara um escopo para toda ferramenta registrada", () => {
    const registered = [
      ...READ_TOOLS,
      ...Object.keys(WRITE_TOOLS),
      ...Object.keys(DESTRUCTIVE_TOOLS),
    ];

    for (const tool of registered) {
      expect(scopeForTool(tool), `ferramenta sem escopo: ${tool}`).toBeDefined();
    }
  });

  it("não declara escopo para ferramenta que não existe", () => {
    const registered = new Set<string>([
      ...READ_TOOLS,
      ...Object.keys(WRITE_TOOLS),
      ...Object.keys(DESTRUCTIVE_TOOLS),
    ]);

    for (const tool of Object.keys(TOOL_SCOPES)) {
      expect(registered.has(tool), `escopo órfão: ${tool}`).toBe(true);
    }
  });

  it("só usa escopos do vocabulário — o mesmo que o CHECK do banco aceita", () => {
    for (const [tool, scope] of Object.entries(TOOL_SCOPES)) {
      expect(isAgentScope(scope), `${tool} usa escopo desconhecido: ${scope}`).toBe(true);
    }
  });

  it("mantém toda leitura em finance:read e nenhuma escrita nele", () => {
    for (const tool of READ_TOOLS) {
      expect(scopeForTool(tool)).toBe("finance:read");
    }

    for (const tool of Object.keys(WRITE_TOOLS)) {
      expect(scopeForTool(tool)).not.toBe("finance:read");
    }
  });

  it("exige destructive:write em toda remoção em cascata", () => {
    for (const tool of Object.keys(DESTRUCTIVE_TOOLS)) {
      expect(scopeForTool(tool)).toBe("destructive:write");
    }
  });

  /**
   * `finance:read` sozinho tem de ser um token inerte para escrita. Se um dia
   * alguém mapear uma escrita para `finance:read`, este teste cai — e é o teste
   * que protege a concessão recomendada, que dá leitura ampla de propósito.
   */
  it("não deixa nenhuma ferramenta destrutiva ou de escrita cair em finance:read", () => {
    const writeLike = [...Object.keys(WRITE_TOOLS), ...Object.keys(DESTRUCTIVE_TOOLS)];
    const readableByReadOnlyToken = writeLike.filter(
      (tool) => TOOL_SCOPES[tool] === "finance:read",
    );

    expect(readableByReadOnlyToken).toEqual([]);
  });

  /**
   * Escopo sem ferramenta é escopo que um token pode carregar sem que ninguém
   * saiba o que ele autoriza. O vocabulário e o mapa andam juntos.
   */
  it("cobre todo escopo do vocabulário", () => {
    const used = new Set(Object.values(TOOL_SCOPES));

    for (const scope of AGENT_SCOPES) {
      expect(used.has(scope), `escopo sem nenhuma ferramenta: ${scope}`).toBe(true);
    }
  });
});
