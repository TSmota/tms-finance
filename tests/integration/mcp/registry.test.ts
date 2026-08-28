import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";

import { prisma } from "@/lib/db";
import { createDebt } from "@/lib/debts";
import { registerTools } from "@/mcp/registry";
import { resetConfirmCodec } from "@/mcp/confirm";
import { DESTRUCTIVE_TOOLS, READ_TOOLS, TOOL_SCOPES, WRITE_TOOLS } from "@/mcp/scopes";
import { makeAccount, makeCategory, makeCreditCard, makePerson, makeUser } from "@tests/support/factories";
import { ctxFor, makeAgent } from "@tests/support/mcpHarness";

/**
 * O registro de ferramentas conferido contra `scopes.ts`.
 *
 * `scopes.test.ts` compara `scopes.ts` consigo mesmo: as três listas de lá são
 * a única fonte que ele conhece. Uma ferramenta registrada em `src/mcp/tools/`
 * e esquecida no mapa passaria por ele intacta — cairia no `!required` do
 * `authorize`, que falha fechado, mas só em runtime e só quando alguém
 * chamasse.
 *
 * Aqui os nomes vêm do `registerTool` de verdade, e as destrutivas são
 * exercitadas pelo callback registrado: é o único teste que prova que a
 * confirmação em duas fases está ligada no caminho que o agente percorre.
 */
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

beforeEach(() => {
  resetConfirmCodec();
});

type Handler = (args: unknown, ctx: ServerContext) => Promise<unknown>;

/** Coleta o que `registerTools` registra, sem levantar transporte nenhum. */
function collectTools(): Map<string, Handler> {
  const tools = new Map<string, Handler>();

  const server = {
    registerTool(name: string, _config: unknown, cb: Handler) {
      if (tools.has(name)) {
        throw new Error(`Ferramenta registrada duas vezes: ${name}`);
      }

      tools.set(name, cb);

      return {};
    },
  } as unknown as McpServer;

  registerTools(server);

  return tools;
}

describe("registro de ferramentas", () => {
  it("registra exatamente as ferramentas que TOOL_SCOPES declara", () => {
    expect([...collectTools().keys()].sort()).toEqual(Object.keys(TOOL_SCOPES).sort());
  });

  it("mantém a partição entre leitura, escrita e destrutiva", () => {
    const registered = collectTools();
    const declared = [
      ...READ_TOOLS,
      ...Object.keys(WRITE_TOOLS),
      ...Object.keys(DESTRUCTIVE_TOOLS),
    ];

    expect(declared).toHaveLength(registered.size);

    for (const tool of declared) {
      expect(registered.has(tool), `declarada e não registrada: ${tool}`).toBe(true);
    }
  });
});

/**
 * Cada alvo é criado limpo: conta com movimentação de dívida, pessoa com
 * posição em aberto e categoria usada por dívida têm recusa de negócio, e a
 * recusa mascararia justamente o que este teste quer ver.
 */
async function destructiveScenario() {
  const user = await makeUser();
  const debtAccount = await makeAccount(user.id, { initialBalance: "1000.00" });
  const debtCategory = await makeCategory(user.id);
  const debtPerson = await makePerson(user.id);

  const debt = await createDebt(user.id, {
    personId: debtPerson.id,
    categoryId: debtCategory.id,
    type: "LENT",
    description: "Empréstimo",
    amount: 100,
    currency: "BRL",
    accountId: debtAccount.id,
    date: "2026-08-01",
    dueDate: null,
    manualFxRate: null,
  });

  return {
    user,
    targets: {
      delete_account: (await makeAccount(user.id)).id,
      delete_credit_card: (await makeCreditCard(user.id)).id,
      delete_person: (await makePerson(user.id)).id,
      delete_category: (await makeCategory(user.id)).id,
      delete_debt: debt.id,
    } satisfies Record<keyof typeof DESTRUCTIVE_TOOLS, string>,
  };
}

describe("primeira chamada de toda ferramenta destrutiva", () => {
  it("pede confirmação em vez de apagar", async () => {
    const { user, targets } = await destructiveScenario();
    const agent = await makeAgent(user.id, ["destructive:write"]);
    const tools = collectTools();

    for (const [tool, id] of Object.entries(targets)) {
      const handler = tools.get(tool);

      if (!handler) {
        throw new Error(`Ferramenta destrutiva não registrada: ${tool}`);
      }

      const result = await handler({ id }, ctxFor(agent, "BRL"));

      expect(
        (result as { resultType?: string }).resultType,
        `${tool} não pediu confirmação`,
      ).toBe("input_required");
    }

    // Nada saiu do banco: a fase de confirmação não escreve.
    const [accounts, categories, people, cards, debts] = await Promise.all([
      prisma.financialAccount.count({ where: { userId: user.id } }),
      prisma.category.count({ where: { userId: user.id } }),
      prisma.person.count({ where: { userId: user.id } }),
      prisma.creditCard.count({ where: { userId: user.id } }),
      prisma.debt.count({ where: { userId: user.id } }),
    ]);

    expect({ accounts, categories, people, cards, debts }).toEqual({
      accounts: 2,
      categories: 2,
      people: 2,
      cards: 1,
      debts: 1,
    });
  });
});
