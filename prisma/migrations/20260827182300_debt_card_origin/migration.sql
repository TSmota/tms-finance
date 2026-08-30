-- Escrita à mão: o Prisma Schema não expressa CHECK.

-- Movimentação de dívida no cartão só existe como saída (RN-05.5).
--
-- `recalcInvoiceTotal` soma os lançamentos da fatura sem olhar o sinal, então um
-- INCOME no cartão aumentaria a fatura em vez de reduzi-la. É o que barra a
-- origem de um BORROWED, que é INCOME, no cartão.
ALTER TABLE "finance"."transactions"
  ADD CONSTRAINT "transactions_debt_card_expense_check"
  CHECK (
    "debt_id" IS NULL
    OR "credit_card_id" IS NULL
    OR "type" = 'EXPENSE'::"finance"."TransactionType"
  );
