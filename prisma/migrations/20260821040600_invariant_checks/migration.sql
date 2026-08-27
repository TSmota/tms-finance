-- Invariantes do domínio que o Prisma Schema não sabe expressar.
-- Escrita à mão: CHECK constraints não são representáveis em schema.prisma,
-- então o Prisma não as gera nem as remove — elas ficam sob controle desta migration.

-- ==========================================
-- TRANSAÇÕES
-- ==========================================

-- Exatamente um meio de pagamento: conta bancária OU cartão de crédito.
-- Compra no cartão não tem account_id (RN-03.2); débito em conta não tem credit_card_id.
ALTER TABLE "finance"."transactions"
  ADD CONSTRAINT "transactions_payment_target_check"
  CHECK (("account_id" IS NULL) <> ("credit_card_id" IS NULL));

-- Valor sempre positivo: a direção do dinheiro vem de `type`, nunca do sinal.
ALTER TABLE "finance"."transactions"
  ADD CONSTRAINT "transactions_positive_amounts_check"
  CHECK ("amount" > 0 AND "converted_amount" > 0 AND "exchange_rate" > 0);

-- Parcelamento é tudo-ou-nada e internamente coerente (RN-03.3).
ALTER TABLE "finance"."transactions"
  ADD CONSTRAINT "transactions_installments_check"
  CHECK (
    ("installment_number" IS NULL AND "total_installments" IS NULL)
    OR (
      "installment_number" >= 1
      AND "total_installments" >= 1
      AND "installment_number" <= "total_installments"
    )
  );

-- ==========================================
-- GASTOS RECORRENTES (RN-04)
-- ==========================================

-- Mesmo XOR: o recorrente é debitado em conta OU lançado no cartão (RN-04.2).
ALTER TABLE "finance"."recurring_expenses"
  ADD CONSTRAINT "recurring_expenses_payment_target_check"
  CHECK (("account_id" IS NULL) <> ("credit_card_id" IS NULL));

ALTER TABLE "finance"."recurring_expenses"
  ADD CONSTRAINT "recurring_expenses_due_day_check"
  CHECK ("due_day" BETWEEN 1 AND 31);

ALTER TABLE "finance"."recurring_expenses"
  ADD CONSTRAINT "recurring_expenses_amount_check"
  CHECK ("amount" > 0);

ALTER TABLE "finance"."recurring_expenses"
  ADD CONSTRAINT "recurring_expenses_period_check"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

-- ==========================================
-- CARTÕES E FATURAS (RN-03)
-- ==========================================

ALTER TABLE "finance"."credit_cards"
  ADD CONSTRAINT "credit_cards_days_check"
  CHECK ("closing_day" BETWEEN 1 AND 31 AND "due_day" BETWEEN 1 AND 31);

ALTER TABLE "finance"."invoices"
  ADD CONSTRAINT "invoices_month_check"
  CHECK ("month" BETWEEN 1 AND 12);

ALTER TABLE "finance"."invoices"
  ADD CONSTRAINT "invoices_total_check"
  CHECK ("total_amount" >= 0);

-- Fatura marcada como paga precisa registrar quando e de qual conta saiu (RN-03.4).
ALTER TABLE "finance"."invoices"
  ADD CONSTRAINT "invoices_paid_consistency_check"
  CHECK (
    "status" <> 'PAID'::"finance"."InvoiceStatus"
    OR ("paid_at" IS NOT NULL AND "payment_account_id" IS NOT NULL)
  );

-- ==========================================
-- DÍVIDAS (RN-05)
-- ==========================================

-- O restante nunca é negativo nem maior que o original (RN-05.4).
-- É esta constraint que torna impossível amortizar acima do saldo devedor.
ALTER TABLE "finance"."debts"
  ADD CONSTRAINT "debts_amounts_check"
  CHECK (
    "original_amount" > 0
    AND "remaining_amount" >= 0
    AND "remaining_amount" <= "original_amount"
  );

-- ==========================================
-- CATEGORIAS (RN-02.3)
-- ==========================================

-- A hierarquia de 2 níveis é garantida em código; aqui barramos só a auto-referência.
ALTER TABLE "finance"."categories"
  ADD CONSTRAINT "categories_no_self_parent_check"
  CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
