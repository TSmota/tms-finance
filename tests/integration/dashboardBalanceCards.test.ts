import { expect, it } from "vitest";
import { getBalanceProjection } from "@/lib/projection";
import { getDebtsByCategory } from "@/lib/reports";
import { createDebt } from "@/lib/debts";
import { createRecurringExpense, materializeRecurring } from "@/lib/recurring";
import { makeUser, makeAccount, makePerson, makeCategory } from "@tests/support/factories";
import { debtInput, recurringExpenseInput } from "@tests/support/inputs";
import { expectBalance } from "@tests/support/money";

it("saldo em contas reflete apenas saldos reais e não infla com empréstimos a receber", async () => {
  const user = await makeUser();
  const account = await makeAccount(user.id, { initialBalance: "2500.00" });
  const person = await makePerson(user.id);
  const category = await makeCategory(user.id);

  // Empresta R$ 500 para um terceiro saindo da conta: saldo cai para 2000, dívida a receber = 500
  await createDebt(
    user.id,
    debtInput({
      personId: person.id,
      categoryId: category.id,
      accountId: account.id,
      type: "LENT",
      amount: 500,
      date: "2026-08-10",
    }),
  );

  await expectBalance(account.id, "2000.00");

  const projection = await getBalanceProjection(user.id, 2026, 8, "BRL");
  const debts = await getDebtsByCategory(user.id, "BRL");

  // O saldo em contas é estritamente a liquidez real de 2000, não os 2500
  expect(projection.currentBalance).toBe(2000);
  expect(debts.receivableTotal).toBe(500);

  // Cria uma despesa recorrente de 300 que materializa como pendência em conta bancária
  await createRecurringExpense(
    user.id,
    recurringExpenseInput({
      categoryId: category.id,
      accountId: account.id,
      amount: 300,
      startDate: "2026-08-01",
      dueDay: 25,
    }),
  );
  await materializeRecurring(user.id, 2026, 8, new Date("2026-08-15T12:00:00Z"));

  const updatedProjection = await getBalanceProjection(user.id, 2026, 8, "BRL");
  // O saldo atual em contas continua 2000 (a pendência ainda não saiu da conta)
  expect(updatedProjection.currentBalance).toBe(2000);
  // O saldo projetado desconta a pendência prevista (2000 - 300 = 1700)
  expect(updatedProjection.projectedBalance).toBe(1700);
});
