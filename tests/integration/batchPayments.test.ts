/** Lotes são indivisíveis, conferem a prévia sob lock e uma chave repetida nunca debita duas vezes. */
import { expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDebt } from "@/lib/debts";
import { createCardPurchase } from "@/lib/cardPurchases";
import { payBatch } from "@/lib/batchPayments";
import { makeUser, makeAccount, makePerson, makeCategory, makeCreditCard } from "@tests/support/factories";
import { batchPaymentInput, debtInput, cardPurchaseInput } from "@tests/support/inputs";
import { expectBalance } from "@tests/support/money";

async function scenario() {
  const user = await makeUser();
  const account = await makeAccount(user.id, { initialBalance: "1000.00" });
  const person = await makePerson(user.id);
  const category = await makeCategory(user.id);
  const debt = await createDebt(user.id, debtInput({ personId: person.id, categoryId: category.id, accountId: account.id, type: "BORROWED", amount: 100 }));
  const card = await makeCreditCard(user.id);
  const [purchase] = await createCardPurchase(user.id, cardPurchaseInput({ creditCardId: card.id, amount: 200 }));
  const input = batchPaymentInput(account.id, [{ id: debt.id, kind: "DEBT", expectedAmount: 100 }, { id: purchase!.invoiceId!, kind: "INVOICE", expectedAmount: 200 }]);
  return { user, account, debt, input, invoiceId: purchase!.invoiceId! };
}

it("paga fatura e dívida no mesmo commit e responde a retries concorrentes", async () => {
  const { user, account, debt, input, invoiceId } = await scenario();
  const [first, second] = await Promise.all([payBatch(user.id, input), payBatch(user.id, input)]);
  expect(first).toEqual(second);
  expect(first).toHaveLength(2);
  await expect(payBatch(user.id, input)).resolves.toEqual(first);
  await expectBalance(account.id, "800.00");
  expect(await prisma.debt.findUnique({ where: { id: debt.id } })).toMatchObject({ status: "PAID" });
  expect(await prisma.invoice.findUnique({ where: { id: invoiceId } })).toMatchObject({ status: "PAID" });
  expect(await prisma.paymentBatch.count()).toBe(1);
  await expect(payBatch(user.id, { ...input, date: "2026-08-21" })).rejects.toThrow("chave");
  await expectBalance(account.id, "800.00");
});

it("reverte inclusive o primeiro pagamento se um valor da prévia mudou", async () => {
  const { user, account, debt, input, invoiceId } = await scenario();
  input.items[1]!.expectedAmount = 199;
  await expect(payBatch(user.id, input)).rejects.toThrow("valor mudou");
  await expectBalance(account.id, "1100.00");
  expect((await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } })).remainingAmount.toFixed(2)).toBe("100.00");
  expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe("OPEN");
  expect(await prisma.paymentBatch.count()).toBe(0);
  expect(await prisma.transaction.count({ where: { type: "INVOICE_PAYMENT" } })).toBe(0);
});

it("recusa seleção repetida e usuário alheio sem pagamentos", async () => {
  const { user, account, input } = await scenario();
  const other = await makeUser();
  await expect(payBatch(other.id, input)).rejects.toThrow();
  await expect(payBatch(user.id, { ...input, items: [input.items[0]!, input.items[0]!] })).rejects.toThrow();
  expect(await prisma.paymentBatch.count()).toBe(0);
  await expectBalance(account.id, "1100.00");
});
