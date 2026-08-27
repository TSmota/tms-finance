import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";

import { prisma } from "@/lib/db";
import { createDebt } from "@/lib/debts";
import { registerTools } from "@/mcp/registry";
import { makeAccount, makeCategory, makePerson, makeUser } from "../factories";
import { setRates } from "../setup-fx";
import { auditFor, ctxFor, makeAgent, readResult } from "../mcpHarness";

/**
 * Os cadastros de base sob `setup:write`, e o preview de remoção sob
 * `finance:read`.
 *
 * As chamadas passam pelo callback que `registerTools` registrou, e não por um
 * `runTool` remontado aqui: o que precisa de prova é a ferramenta que o agente
 * de fato alcança — schema, serviço, serializador e escopo, na composição real.
 */
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { revalidatePath } = await import("next/cache");

beforeEach(() => {
  setRates({});
  vi.mocked(revalidatePath).mockClear();
});

type Handler = (args: unknown, ctx: ServerContext) => Promise<unknown>;

const tools = (() => {
  const registered = new Map<string, Handler>();

  const server = {
    registerTool(name: string, _config: unknown, cb: Handler) {
      registered.set(name, cb);

      return {};
    },
  } as unknown as McpServer;

  registerTools(server);

  return registered;
})();

function call(tool: string, args: unknown, ctx: ServerContext) {
  const handler = tools.get(tool);

  if (!handler) {
    throw new Error(`Ferramenta não registrada: ${tool}`);
  }

  return handler(args, ctx);
}

async function setupAgent() {
  const user = await makeUser();
  const agent = await makeAgent(user.id, ["finance:read", "setup:write"]);

  return { user, ctx: ctxFor(agent, "BRL") };
}

describe("create_category", () => {
  it("grava a categoria e devolve cor e ícone na listagem", async () => {
    const { user, ctx } = await setupAgent();

    const created = readResult(
      await call("create_category", { name: "Moradia", color: "#40c057", icon: "home" }, ctx),
    );

    expect(created.ok).toBe(true);

    const root = await prisma.category.findFirstOrThrow({ where: { userId: user.id } });

    expect(root.color).toBe("#40c057");
    expect(revalidatePath).toHaveBeenCalled();

    // O round-trip é o ponto: `update_category` substitui o estado inteiro, e o
    // agente só preserva o que a listagem lhe mostrou.
    const listed = readResult(await call("list_categories", {}, ctx));

    expect(listed.data).toMatchObject([{ id: root.id, color: "#40c057", icon: "home" }]);
  });

  it("recusa subcategoria de subcategoria e não deixa lixo", async () => {
    const { user, ctx } = await setupAgent();
    const root = await makeCategory(user.id);
    const child = await makeCategory(user.id, { parentId: root.id });

    const payload = readResult(
      await call("create_category", { name: "Neta", parentId: child.id }, ctx),
    );

    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("invalid_operation");
    expect(String(payload.message)).toContain("dois níveis");
    expect(await prisma.category.count({ where: { userId: user.id } })).toBe(2);
  });
});

describe("update_category", () => {
  it("substitui o estado completo, inclusive apagando a cor omitida", async () => {
    const { user, ctx } = await setupAgent();
    const category = await makeCategory(user.id, { name: "Antigo", color: "#40c057" });

    const payload = readResult(
      await call("update_category", { id: category.id, data: { name: "Novo" } }, ctx),
    );

    expect(payload.ok).toBe(true);

    const updated = await prisma.category.findUniqueOrThrow({ where: { id: category.id } });

    expect(updated.name).toBe("Novo");
    expect(updated.color).toBeNull();
  });

  it("recusa rebaixar categoria que já tem subcategorias", async () => {
    const { user, ctx } = await setupAgent();
    const root = await makeCategory(user.id);
    const other = await makeCategory(user.id);

    await makeCategory(user.id, { parentId: root.id });

    const payload = readResult(
      await call("update_category", { id: root.id, data: { name: "X", parentId: other.id } }, ctx),
    );

    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("invalid_operation");

    const unchanged = await prisma.category.findUniqueOrThrow({ where: { id: root.id } });

    expect(unchanged.parentId).toBeNull();
  });
});

describe("create_person e update_person", () => {
  it("cria a pessoa que create_debt exige", async () => {
    const { user, ctx } = await setupAgent();

    const payload = readResult(
      await call("create_person", { name: "João", notes: "Vizinho" }, ctx),
    );

    expect(payload.ok).toBe(true);

    const person = await prisma.person.findFirstOrThrow({ where: { userId: user.id } });

    expect(person.name).toBe("João");
    expect((payload.data as { id: string }).id).toBe(person.id);
  });

  it("substitui o estado completo, apagando notes omitido", async () => {
    const { user, ctx } = await setupAgent();
    const person = await makePerson(user.id, { name: "Ana", notes: "Antigo" });

    readResult(await call("update_person", { id: person.id, data: { name: "Ana Maria" } }, ctx));

    const updated = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });

    expect(updated.name).toBe("Ana Maria");
    expect(updated.notes).toBeNull();
  });

  it("não alcança pessoa de outro usuário", async () => {
    const { ctx } = await setupAgent();
    const stranger = await makeUser();
    const person = await makePerson(stranger.id, { name: "Alheia" });

    const payload = readResult(
      await call("update_person", { id: person.id, data: { name: "Invadida" } }, ctx),
    );

    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("not_found");

    const untouched = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });

    expect(untouched.name).toBe("Alheia");
  });
});

describe("escopo setup:write", () => {
  it("recusa token só de leitura, sem escrever nada, e audita a recusa", async () => {
    const user = await makeUser();
    const readOnly = ctxFor(await makeAgent(user.id, ["finance:read"]), "BRL");

    const attempts = [
      ["create_category", { name: "Proibida" }],
      ["update_category", { id: (await makeCategory(user.id)).id, data: { name: "X" } }],
      ["create_person", { name: "Proibida" }],
      ["update_person", { id: (await makePerson(user.id)).id, data: { name: "X" } }],
    ] as const;

    const before = {
      categories: await prisma.category.count({ where: { userId: user.id } }),
      people: await prisma.person.count({ where: { userId: user.id } }),
    };

    for (const [tool, args] of attempts) {
      const payload = readResult(await call(tool, args, readOnly));

      expect(payload.code, `${tool} não recusou`).toBe("forbidden_scope");
      expect(String(payload.message)).toContain("setup:write");

      const [entry] = await auditFor(tool);

      expect(entry.verdict).toBe("FORBIDDEN_SCOPE");
    }

    expect(await prisma.category.count({ where: { userId: user.id } })).toBe(before.categories);
    expect(await prisma.person.count({ where: { userId: user.id } })).toBe(before.people);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("get_deletion_impact", () => {
  it("mede o impacto sem remover nada e antecipa a recusa em blocked_by", async () => {
    const user = await makeUser();
    const ctx = ctxFor(await makeAgent(user.id, ["finance:read"]), "BRL");
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);

    await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Empréstimo",
      amount: 100,
      currency: "BRL",
      accountId: account.id,
      date: "2026-08-01",
      dueDate: null,
      manualFxRate: null,
    });

    const payload = readResult(
      await call("get_deletion_impact", { target: "category", id: category.id }, ctx),
    );

    expect(payload.ok).toBe(true);

    const impact = payload.data as { blocked_by: string | null; target: string };

    expect(impact.target).toBe("category");
    expect(impact.blocked_by).toContain("dívida");

    // Leitura é leitura: a categoria continua lá, e nada foi invalidado.
    expect(await prisma.category.count({ where: { id: category.id } })).toBe(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("recusa alvo fora do vocabulário de remoção", async () => {
    const { ctx } = await setupAgent();

    const payload = readResult(
      await call("get_deletion_impact", { target: "invoice", id: crypto.randomUUID() }, ctx),
    );

    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("invalid_input");
  });
});
