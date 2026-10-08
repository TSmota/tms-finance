/** Ferramentas reais exigem escopo próprio, não escrevem na recusa e auditam sucesso e falha. */
import { expect, it, vi } from "vitest";
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { registerTools } from "@/mcp/registry";
import { prisma } from "@/lib/db";
import { makeUser, makeAccount, makePerson, makeCategory } from "@tests/support/factories";
import { transferInput, savingsGoalInput, batchPaymentInput, debtInput } from "@tests/support/inputs";
import { createDebt } from "@/lib/debts";
import { expectBalance } from "@tests/support/money";
import { ctxFor, makeAgent, readResult, auditFor } from "@tests/support/mcpHarness";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
type Handler = (input: unknown, ctx: ServerContext) => Promise<unknown>;
const handlers = new Map<string, Handler>();
registerTools({ registerTool: (name: string, _config: unknown, handler: Handler) => {
  handlers.set(name, handler); return {};
} } as unknown as McpServer);

it("isola os novos escopos e serializa transferências sem floats", async () => {
  const user = await makeUser();
  const source = await makeAccount(user.id, { initialBalance: "1000.00" });
  const destination = await makeAccount(user.id);
  const reader = ctxFor(await makeAgent(user.id, ["finance:read"]), "BRL");
  for (const [tool, input] of [
    ["create_transfer", transferInput(source.id, destination.id)],
    ["create_savings_goal", savingsGoalInput()],
    ["pay_batch", batchPaymentInput(source.id, [{ id: crypto.randomUUID(), kind: "INVOICE", expectedAmount: 1 }])],
  ] as const) {
    expect(readResult(await handlers.get(tool)!(input, reader)).ok).toBe(false);
    expect((await auditFor(tool))[0]?.verdict).toBe("FORBIDDEN_SCOPE");
  }
  expect(await prisma.transfer.count()).toBe(0);
  expect(await prisma.savingsGoal.count()).toBe(0);
  expect(await prisma.paymentBatch.count()).toBe(0);
  await expectBalance(source.id, "1000.00");
  const writer = ctxFor(await makeAgent(user.id, ["transfers:write", "goals:write", "payments:write"]), "BRL");
  expect(readResult(await handlers.get("create_transfer")!(transferInput(source.id, destination.id), writer))).toMatchObject({
    ok: true,
    data: {
      amount: "100.01",
      source_account_id: source.id,
      destination_account_id: destination.id,
    },
  });
  expect(readResult(await handlers.get("create_savings_goal")!(savingsGoalInput(), writer)).ok).toBe(true);
  expect((await auditFor("create_transfer"))[1]?.verdict).toBe("OK");
  await expectBalance(source.id, "899.99");
  await expectBalance(destination.id, "100.01");

  const person = await makePerson(user.id);
  const category = await makeCategory(user.id);
  const debt = await createDebt(user.id, debtInput({
    personId: person.id,
    categoryId: category.id,
    type: "BORROWED",
    amount: 25,
    accountId: source.id,
  }));
  const payment = readResult(await handlers.get("pay_batch")!(
    batchPaymentInput(source.id, [{ id: debt.id, kind: "DEBT", expectedAmount: 25 }]),
    writer,
  ));
  expect(payment).toMatchObject({ ok: true, data: { transaction_ids: [expect.any(String)] } });
  expect((await auditFor("pay_batch")).at(-1)?.verdict).toBe("OK");
  expect(await prisma.paymentBatch.count()).toBe(1);
  expect(await prisma.debt.findUnique({ where: { id: debt.id } })).toMatchObject({ status: "PAID" });
  await expectBalance(source.id, "899.99");
});
