/** Progresso manual é a soma do histórico; retiradas concorrentes nunca deixam saldo negativo nem movem contas. */
import { expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createSavingsGoal, updateSavingsGoal, addSavingsEntry, listSavingsGoals } from "@/lib/savingsGoals";
import { makeUser, makeAccount } from "@tests/support/factories";
import { savingsGoalInput, savingsEntryInput } from "@tests/support/inputs";
import { expectBalance } from "@tests/support/money";

it("deriva conclusão, reabre ao mudar alvo e preserva o histórico", async () => {
  const user = await makeUser();
  const account = await makeAccount(user.id, { initialBalance: "1000.00" });
  const goal = await createSavingsGoal(user.id, savingsGoalInput());
  await addSavingsEntry(user.id, goal.id, savingsEntryInput({ amount: 100 }));
  expect((await listSavingsGoals(user.id))[0]).toMatchObject({ status: "COMPLETED", progress: "100.00" });
  await updateSavingsGoal(user.id, goal.id, savingsGoalInput({ targetAmount: 200, paused: true }));
  await expect(addSavingsEntry(user.id, goal.id, savingsEntryInput())).rejects.toThrow("Retome");
  expect(await prisma.savingsEntry.count()).toBe(1);
  await updateSavingsGoal(user.id, goal.id, savingsGoalInput({ targetAmount: 200 }));
  expect((await listSavingsGoals(user.id))[0]).toMatchObject({ status: "ACTIVE", percentage: 50 });
  await expectBalance(account.id, "1000.00");
  expect(await prisma.transaction.count()).toBe(0);
});

it("serializa retiradas e isola usuários e moeda", async () => {
  const user = await makeUser();
  const other = await makeUser();
  const goal = await createSavingsGoal(user.id, savingsGoalInput());
  await addSavingsEntry(user.id, goal.id, savingsEntryInput({ amount: 100 }));
  const results = await Promise.allSettled([1, 2].map(() => addSavingsEntry(user.id, goal.id, savingsEntryInput({ amount: 60, kind: "WITHDRAWAL" }))));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  await expect(addSavingsEntry(other.id, goal.id, savingsEntryInput())).rejects.toThrow("não encontrada");
  await expect(updateSavingsGoal(user.id, goal.id, savingsGoalInput({ currency: "USD" }))).rejects.toThrow("moeda");
  expect((await listSavingsGoals(user.id))[0]).toMatchObject({ progress: "40.00" });
  expect(await prisma.savingsEntry.count()).toBe(2);
  expect(await listSavingsGoals(other.id)).toEqual([]);
});
