-- Uma recorrência produz no máximo uma ocorrência por data (RN-04.2).
--
-- É o que torna a materialização lazy segura sob concorrência: dois renders
-- simultâneos do mesmo mês tentam inserir a mesma linha e o segundo é
-- descartado pelo ON CONFLICT DO NOTHING, sem abortar a transação.
--
-- Linhas sem recorrência não colidem entre si: no Postgres, NULLs são
-- distintos para efeito de índice único.
CREATE UNIQUE INDEX "transactions_recurring_occurrence_key" ON "finance"."transactions"("recurring_expense_id", "date");
