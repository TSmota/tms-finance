-- As pendências do painel filtram `status` e depois faixa de `date`. Com
-- `(user_id, status)` o range ficava fora do index scan.
-- `(user_id, status)` vira prefixo à esquerda do índice novo, e
-- `(recurring_expense_id)` já é prefixo do UNIQUE
-- `transactions_recurring_occurrence_key`: os dois são redundantes e só custam
-- escrita.

-- DropIndex
DROP INDEX "finance"."transactions_recurring_expense_id_idx";

-- DropIndex
DROP INDEX "finance"."transactions_user_id_status_idx";

-- CreateIndex
CREATE INDEX "transactions_user_id_status_date_idx" ON "finance"."transactions"("user_id", "status", "date");
