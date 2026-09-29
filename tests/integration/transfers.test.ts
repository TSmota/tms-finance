/** Transferências preservam dinheiro entre duas contas, inclusive em edição, recusa e estorno concorrente. */
import { expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createTransfer, updateTransfer, deleteTransfer } from "@/lib/transfers";
import { deleteAccount } from "@/lib/accounts";
import { getMonthSummary } from "@/lib/reports";
import { exportUserData } from "@/lib/userAccount";
import { makeUser, makeAccount } from "@tests/support/factories";
import { transferInput } from "@tests/support/inputs";
import { expectBalance } from "@tests/support/money";

it("cria, edita e estorna sem inflar o fluxo de caixa", async () => {
  const user = await makeUser();
  const source = await makeAccount(user.id, { initialBalance: "1000.00" });
  const destination = await makeAccount(user.id);
  const row = await createTransfer(user.id, transferInput(source.id, destination.id));
  await expectBalance(source.id, "899.99");
  await expectBalance(destination.id, "100.01");
  expect(await getMonthSummary(user.id, 2026, 8, "BRL")).toMatchObject({ income: 0, expenses: 0, spendingTotal: 0 });
  expect(await exportUserData(user.id)).toMatchObject({ transfers: [{ id: row.id }] });
  await expect(deleteAccount(user.id, source.id)).rejects.toThrow("transferências");
  await updateTransfer(user.id, row.id, transferInput(destination.id, source.id, { amount: 20.02 }));
  await expectBalance(source.id, "1020.02");
  await expectBalance(destination.id, "-20.02");
  const outcomes = await Promise.allSettled([deleteTransfer(user.id, row.id), deleteTransfer(user.id, row.id)]);
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  await expectBalance(source.id, "1000.00");
  await expectBalance(destination.id, "0.00");
});

it("recusa conta alheia, mesma conta, moeda diferente e valor subcentavo sem efeitos", async () => {
  const user = await makeUser();
  const other = await makeUser();
  const source = await makeAccount(user.id, { initialBalance: "1000.00" });
  const foreign = await makeAccount(other.id);
  const usd = await makeAccount(user.id, { currency: "USD" });
  for (const input of [transferInput(source.id, foreign.id), transferInput(source.id, source.id), transferInput(source.id, usd.id), transferInput(source.id, foreign.id, { amount: 0.001 })]) {
    await expect(createTransfer(user.id, input)).rejects.toThrow();
  }
  expect(await prisma.transfer.count()).toBe(0);
  await expectBalance(source.id, "1000.00");
  await expectBalance(foreign.id, "0.00");
  await expectBalance(usd.id, "0.00");
});
