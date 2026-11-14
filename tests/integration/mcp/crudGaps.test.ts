import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";

import { prisma } from "@/lib/db";
import { registerTools } from "@/mcp/registry";
import {
  makeAccount,
  makeCategory,
  makeCreditCard,
  makePerson,
  makeUser,
} from "@tests/support/factories";
import { ctxFor, makeAgent, readResult } from "@tests/support/mcpHarness";
import { createTransaction } from "@/lib/transactions";
import { createCardPurchase } from "@/lib/cardPurchases";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { revalidatePath } = await import("next/cache");

beforeEach(() => {
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

describe("MCP CRUD Gaps: cards:write & finance:read", () => {
  it("create_credit_card e update_credit_card sob cards:write", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const agent = await makeAgent(user.id, ["cards:write"]);
    const ctx = ctxFor(agent, "BRL");

    // Criação do cartão
    const created = readResult(
      await call(
        "create_credit_card",
        {
          name: "Nubank Ultravioleta",
          institution: "Nubank",
          closingDay: 5,
          dueDay: 12,
          currency: "BRL",
          creditLimit: 10000,
          defaultPaymentAccountId: account.id,
        },
        ctx,
      ),
    );

    expect(created.ok).toBe(true);

    const card = await prisma.creditCard.findFirstOrThrow({ where: { userId: user.id } });
    expect(card.name).toBe("Nubank Ultravioleta");
    expect(card.closingDay).toBe(5);
    expect(card.dueDay).toBe(12);

    // Atualização do cartão
    const updated = readResult(
      await call(
        "update_credit_card",
        {
          id: card.id,
          data: {
            name: "Nubank Black",
            institution: "Nubank",
            closingDay: 7,
            dueDay: 14,
            currency: "BRL",
            creditLimit: 15000,
            defaultPaymentAccountId: account.id,
          },
        },
        ctx,
      ),
    );

    expect(updated.ok).toBe(true);
    const reloaded = await prisma.creditCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(reloaded.name).toBe("Nubank Black");
    expect(reloaded.closingDay).toBe(7);
    expect(reloaded.dueDay).toBe(14);
  });

  it("list_people lista pessoas cadastradas sob finance:read", async () => {
    const user = await makeUser();
    await makePerson(user.id, { name: "Carlos" });
    await makePerson(user.id, { name: "Beatriz" });

    const agent = await makeAgent(user.id, ["finance:read"]);
    const ctx = ctxFor(agent, "BRL");

    const result = readResult(await call("list_people", {}, ctx));
    expect(result.ok).toBe(true);

    const people = result.data as Array<{ name: string }>;
    expect(people).toHaveLength(2);
    // Ordenado por nome
    expect(people[0].name).toBe("Beatriz");
    expect(people[1].name).toBe("Carlos");
  });

  it("get_transaction recupera detalhe completo de um lançamento sob finance:read", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const category = await makeCategory(user.id, { name: "Alimentação" });

    const tx = await createTransaction(user.id, {
      accountId: account.id,
      categoryId: category.id,
      type: "EXPENSE",
      amount: 45.5,
      currency: "BRL",
      date: "2026-11-10",
      description: "Restaurante",
      manualFxRate: null,
    });

    const agent = await makeAgent(user.id, ["finance:read"]);
    const ctx = ctxFor(agent, "BRL");

    const result = readResult(await call("get_transaction", { id: tx.id }, ctx));
    expect(result.ok).toBe(true);

    const data = result.data as {
      id: string;
      description: string;
      amount: string;
      type: string;
      category: { id: string; name: string } | null;
    };
    expect(data.id).toBe(tx.id);
    expect(data.description).toBe("Restaurante");
    expect(data.amount).toBe("45.50");
    expect(data.type).toBe("EXPENSE");
    expect(data.category?.name).toBe("Alimentação");
  });

  it("get_invoice recupera detalhe consolidado de uma fatura sob finance:read", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 10, dueDay: 20 });
    const category = await makeCategory(user.id);

    // Cria compra para gerar fatura
    await createCardPurchase(user.id, {
      creditCardId: card.id,
      categoryId: category.id,
      description: "Supermercado",
      amount: 250,
      currency: "BRL",
      date: "2026-11-05",
      installments: 1,
      manualFxRate: null,
    });

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { creditCardId: card.id },
    });

    const agent = await makeAgent(user.id, ["finance:read"]);
    const ctx = ctxFor(agent, "BRL");

    const result = readResult(await call("get_invoice", { id: invoice.id }, ctx));
    expect(result.ok).toBe(true);

    const data = result.data as {
      id: string;
      competency: string;
      total: string;
      status: string;
    };
    expect(data.id).toBe(invoice.id);
    expect(data.competency).toBe("2026-11");
    expect(data.total).toBe("250.00");
    expect(data.status).toBe("OPEN");
  });
});
