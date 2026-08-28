import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { deleteAccount } from "@/lib/accounts";
import { deletePerson } from "@/lib/people";
import { createDebt, settleDebt } from "@/lib/debts";
import { createTransaction } from "@/lib/transactions";
import { runDestructiveTool } from "@/mcp/guard";
import { confirmCodec, resetConfirmCodec, type ConfirmPayload } from "@/mcp/confirm";
import { idArgs } from "@/mcp/args";
import { makeAccount, makeCategory, makePerson, makeUser } from "@tests/support/factories";
import { auditFor, ctxFor, makeAgent, readResult, type Agent } from "@tests/support/mcpHarness";

/**
 * Confirmação em duas fases das remoções em cascata.
 *
 * A garantia sob teste é uma só, e é a que justifica expor essas ferramentas:
 * **a primeira chamada nunca apaga nada.** Todo caso aqui confere o banco depois
 * da primeira fase, porque um `confirmation_required` que já apagou seria a
 * pior falha possível — a proteção viraria teatro.
 */
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

beforeEach(() => {
  resetConfirmCodec();
});

/** Conta com dois lançamentos: substância suficiente para o impacto ser real. */
async function accountScenario() {
  const user = await makeUser();
  const account = await makeAccount(user.id, { name: "Conta", initialBalance: "1000.00" });
  const category = await makeCategory(user.id);

  for (const date of ["2026-07-02", "2026-08-09"]) {
    await createTransaction(user.id, {
      accountId: account.id,
      categoryId: category.id,
      type: "EXPENSE",
      amount: 50,
      currency: "BRL",
      date,
      description: "Gasto",
      manualFxRate: null,
    });
  }

  const agent = await makeAgent(user.id, ["destructive:write"]);

  return { user, account, agent };
}

function deleteAccountTool(
  agent: Agent,
  id: string,
  ctxOptions: Parameters<typeof ctxFor>[2] = {},
) {
  return runDestructiveTool({
    ctx: ctxFor(agent, "BRL", ctxOptions),
    tool: "delete_account",
    target: "account",
    input: { id },
    schema: idArgs,
    run: (a, target) => deleteAccount(a.userId, target),
    revalidates: "setup",
  });
}

/** Aceite do cliente, na forma que o `acceptedContent` do SDK reconhece. */
function accepted(confirm: boolean) {
  return { confirm: { action: "accept", content: { confirm } } };
}

describe("primeira fase", () => {
  it("não apaga nada e devolve input_required com o impacto", async () => {
    const { account, agent } = await accountScenario();

    const result = await deleteAccountTool(agent, account.id);

    // É um input_required do protocolo, não um resultado de ferramenta.
    expect((result as { resultType?: string }).resultType).toBe("input_required");

    const requests = (result as { inputRequests?: Record<string, unknown> }).inputRequests;

    expect(requests?.confirm).toBeDefined();
    expect(typeof (result as { requestState?: unknown }).requestState).toBe("string");

    // A garantia central: nada foi tocado.
    await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(await prisma.transaction.count({ where: { accountId: account.id } })).toBe(2);

    const [entry] = await auditFor("delete_account");

    expect(entry.verdict).toBe("CONFIRM_REQUIRED");
    expect(entry.affectedIds).toEqual([]);
  });

  it("põe as contagens do impacto na pergunta que o humano lê", async () => {
    const { account, agent } = await accountScenario();

    const result = await deleteAccountTool(agent, account.id);
    const request = (result as { inputRequests: Record<string, { params: { message: string } }> })
      .inputRequests.confirm;

    expect(request.params.message).toContain('Remover "Conta" é irreversível.');
    expect(request.params.message).toContain("2 lançamentos apagados junto");
    expect(request.params.message).toContain("2026-07-02");
  });

  it("repetir a primeira fase continua não apagando nada", async () => {
    const { account, agent } = await accountScenario();

    await deleteAccountTool(agent, account.id);
    await deleteAccountTool(agent, account.id);
    await deleteAccountTool(agent, account.id);

    await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });

    const entries = await auditFor("delete_account");

    expect(entries.map((row) => row.verdict)).toEqual([
      "CONFIRM_REQUIRED",
      "CONFIRM_REQUIRED",
      "CONFIRM_REQUIRED",
    ]);
  });

  it("recusa antes de pedir confirmação quando a remoção é impossível", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);
    const agent = await makeAgent(user.id, ["destructive:write"]);

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

    const result = await runDestructiveTool({
      ctx: ctxFor(agent, "BRL"),
      tool: "delete_person",
      target: "person",
      input: { id: person.id },
      schema: idArgs,
      run: (a, id) => deletePerson(a.userId, id),
      revalidates: "people",
    });
    const payload = readResult(result);

    // Nem gasta uma rodada de confirmação: a operação era impossível já.
    expect(payload.code).toBe("invalid_operation");
    expect(String(payload.message)).toMatch(/dívida\(s\) em aberto/);

    const [entry] = await auditFor("delete_person");

    expect(entry.verdict).toBe("DOMAIN_ERROR");
  });

  it("valida a entrada ANTES de emitir requestState", async () => {
    const { agent } = await accountScenario();

    const result = await deleteAccountTool(agent, "nao-e-uuid");
    const payload = readResult(result);

    expect(payload.code).toBe("invalid_input");
    // Emitir estado para argumentos que não passam no schema seria emitir
    // estado para uma chamada que nunca vai executar.
    expect((result as { requestState?: unknown }).requestState).toBeUndefined();
  });
});

describe("segunda fase", () => {
  /** Faz a 1ª fase e devolve o payload verificado, como o seam entregaria. */
  async function confirmedCtxOptions(agent: Agent, payload: ConfirmPayload) {
    const ctx = ctxFor(agent, "BRL");
    const state = await confirmCodec().mint(payload, ctx);

    return {
      inputResponses: accepted(true),
      requestState: await confirmCodec().verify(state, ctx),
    };
  }

  it("apaga quando o state confere com a chamada", async () => {
    const { account, agent } = await accountScenario();

    const options = await confirmedCtxOptions(agent, {
      tool: "delete_account",
      target: "account",
      id: account.id,
    });

    const result = await deleteAccountTool(agent, account.id, options);
    const payload = readResult(result);

    expect(payload.ok).toBe(true);
    expect(await prisma.financialAccount.count({ where: { id: account.id } })).toBe(0);
    expect(await prisma.transaction.count({ where: { accountId: account.id } })).toBe(0);

    // O resultado devolve o impacto que de fato se concretizou.
    const removed = (payload.data as { removed: { destroys: Array<{ count: number }> } }).removed;

    expect(removed.destroys[0].count).toBe(2);

    const entries = await auditFor("delete_account");

    expect(entries.map((row) => row.verdict)).toEqual(["OK"]);
    expect(entries[0].affectedIds).toEqual([account.id]);
  });

  it("recusa state emitido para OUTRA conta e não apaga nada", async () => {
    const { account, agent, user } = await accountScenario();
    const other = await makeAccount(user.id, { name: "Outra" });

    const options = await confirmedCtxOptions(agent, {
      tool: "delete_account",
      target: "account",
      id: other.id,
    });

    const result = await deleteAccountTool(agent, account.id, options);

    // Volta a pedir confirmação em vez de aceitar o state alheio.
    expect((result as { resultType?: string }).resultType).toBe("input_required");
    await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });
    await prisma.financialAccount.findUniqueOrThrow({ where: { id: other.id } });
  });

  it("recusa aceite sem state", async () => {
    const { account, agent } = await accountScenario();

    const result = await deleteAccountTool(agent, account.id, {
      inputResponses: accepted(true),
    });

    expect((result as { resultType?: string }).resultType).toBe("input_required");
    await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });
  });

  it("recusa quando o cliente respondeu não", async () => {
    const { account, agent } = await accountScenario();

    const options = await confirmedCtxOptions(agent, {
      tool: "delete_account",
      target: "account",
      id: account.id,
    });

    const result = await deleteAccountTool(agent, account.id, {
      ...options,
      inputResponses: accepted(false),
    });

    expect((result as { resultType?: string }).resultType).toBe("input_required");
    await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });
  });
});

describe("escopo", () => {
  it("recusa sem destructive:write, mesmo com escrita comum concedida", async () => {
    const { account, user } = await accountScenario();
    const agent = await makeAgent(user.id, ["finance:read", "transactions:write"]);

    const result = await deleteAccountTool(agent, account.id);
    const payload = readResult(result);

    expect(payload.code).toBe("forbidden_scope");
    await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } });

    const [entry] = await auditFor("delete_account");

    expect(entry.verdict).toBe("FORBIDDEN_SCOPE");
  });
});

describe("remoção de dívida reverte o caixa", () => {
  it("apaga movimentações e devolve o saldo, nas duas fases", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);
    const agent = await makeAgent(user.id, ["destructive:write"]);

    const debt = await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Empréstimo",
      amount: 300,
      currency: "BRL",
      accountId: account.id,
      date: "2026-08-01",
      dueDate: null,
      manualFxRate: null,
    });

    await settleDebt(user.id, debt.id, {
      amount: 100,
      currency: "BRL",
      accountId: account.id,
      date: "2026-08-15",
      categoryId: null,
      description: null,
      manualFxRate: null,
    });

    const call = (options: Parameters<typeof ctxFor>[2] = {}) =>
      runDestructiveTool({
        ctx: ctxFor(agent, "BRL", options),
        tool: "delete_debt",
        target: "debt",
        input: { id: debt.id },
        schema: idArgs,
        run: (a, id) => import("@/lib/debts").then((m) => m.deleteDebt(a.userId, id)),
        revalidates: "debts",
      });

    // 1ª fase: nada muda, nem a dívida nem o saldo.
    await call();

    const midway = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { currentBalance: true },
    });

    expect(midway.currentBalance.toFixed(2)).toBe("800.00");

    const ctx = ctxFor(agent, "BRL");
    const payload: ConfirmPayload = { tool: "delete_debt", target: "debt", id: debt.id };
    const state = await confirmCodec().mint(payload, ctx);

    await call({
      inputResponses: accepted(true),
      requestState: await confirmCodec().verify(state, ctx),
    });

    // 2ª fase: as duas pontas. Movimentações fora, saldo de volta ao inicial.
    expect(await prisma.transaction.count({ where: { debtId: debt.id } })).toBe(0);

    const after = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { currentBalance: true },
    });

    expect(after.currentBalance.toFixed(2)).toBe("1000.00");
  });
});
