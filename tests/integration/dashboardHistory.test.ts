/** Histórico cruza anos em UTC; patrimônio desconta dívidas/faturas e sinaliza câmbio incompleto. */
import { expect, it } from "vitest";
import { getMonthlyHistory, getNetWorth } from "@/lib/dashboardHistory";
import { createTransaction } from "@/lib/transactions";
import { createDebt } from "@/lib/debts";
import { createCardPurchase } from "@/lib/cardPurchases";
import { makeUser, makeAccount, makePerson, makeCategory, makeCreditCard } from "@tests/support/factories";
import { transactionInput, debtInput, cardPurchaseInput } from "@tests/support/inputs";
import { itAcrossTimeZones } from "@tests/support/timeZones";
import { expectBalance } from "@tests/support/money";

itAcrossTimeZones("compara doze meses sem perder a virada de ano", async () => {
  const user = await makeUser();
  const account = await makeAccount(user.id);
  await createTransaction(user.id, transactionInput({ accountId: account.id, amount: 10.01, type: "INCOME", date: "2025-12-31" }));
  const rows = await getMonthlyHistory(user.id, 2026, 1, "BRL");
  expect(rows).toHaveLength(12);
  expect(rows[0]?.label).toBe("02/2025");
  expect(rows[10]).toMatchObject({ label: "12/2025", income: 10.01, net: 10.01 });
  expect(rows[11]).toMatchObject({ label: "01/2026", income: 0 });
  await expectBalance(account.id, "10.01");
});

it("desconta passivos, não duplica metas e sinaliza cotação ausente", async () => {
  const user = await makeUser();
  const account = await makeAccount(user.id, { initialBalance: "1000.00" });
  const person = await makePerson(user.id);
  const category = await makeCategory(user.id);
  await createDebt(user.id, debtInput({ personId: person.id, categoryId: category.id, accountId: account.id, type: "BORROWED", amount: 100 }));
  const card = await makeCreditCard(user.id);
  await createCardPurchase(user.id, cardPurchaseInput({ creditCardId: card.id, amount: 50 }));
  expect(await getNetWorth(user.id, "BRL")).toEqual({ amount: 950, complete: true });
  await makeAccount(user.id, { currency: "USD", initialBalance: "100.00" });
  expect(await getNetWorth(user.id, "BRL")).toEqual({ amount: 950, complete: false });
  await expectBalance(account.id, "1100.00");
});
