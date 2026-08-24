-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "finance";

-- CreateEnum
CREATE TYPE "finance"."Currency" AS ENUM ('BRL', 'USD', 'EUR', 'GBP');

-- CreateEnum
CREATE TYPE "finance"."TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'INVOICE_PAYMENT');

-- CreateEnum
CREATE TYPE "finance"."TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "finance"."InvoiceStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID');

-- CreateEnum
CREATE TYPE "finance"."RecurrenceFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "finance"."DebtType" AS ENUM ('LENT', 'BORROWED');

-- CreateEnum
CREATE TYPE "finance"."DebtStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID');

-- CreateTable
CREATE TABLE "finance"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "email_verified" TIMESTAMP(3),
    "password_hash" TEXT,
    "base_currency" "finance"."Currency" NOT NULL DEFAULT 'BRL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "finance"."financial_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" "finance"."Currency" NOT NULL DEFAULT 'BRL',
    "initial_balance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "current_balance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "parent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."credit_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "closing_day" INTEGER NOT NULL,
    "due_day" INTEGER NOT NULL,
    "currency" "finance"."Currency" NOT NULL DEFAULT 'BRL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "credit_card_id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "closing_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "finance"."InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "currency" "finance"."Currency" NOT NULL DEFAULT 'BRL',
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "payment_account_id" UUID,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."recurring_expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "finance"."Currency" NOT NULL DEFAULT 'BRL',
    "frequency" "finance"."RecurrenceFrequency" NOT NULL DEFAULT 'MONTHLY',
    "due_day" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_estimated" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "last_generated_at" TIMESTAMP(3),
    "category_id" UUID NOT NULL,
    "account_id" UUID,
    "credit_card_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."people" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."debts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "type" "finance"."DebtType" NOT NULL,
    "status" "finance"."DebtStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "original_amount" DECIMAL(12,2) NOT NULL,
    "remaining_amount" DECIMAL(12,2) NOT NULL,
    "currency" "finance"."Currency" NOT NULL DEFAULT 'BRL',
    "due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "finance"."TransactionType" NOT NULL,
    "status" "finance"."TransactionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "finance"."Currency" NOT NULL DEFAULT 'BRL',
    "exchange_rate" DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
    "converted_amount" DECIMAL(12,2) NOT NULL,
    "account_id" UUID,
    "category_id" UUID,
    "credit_card_id" UUID,
    "invoice_id" UUID,
    "recurring_expense_id" UUID,
    "debt_id" UUID,
    "installment_number" INTEGER,
    "total_installments" INTEGER,
    "parent_installment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "finance"."users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "finance"."accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "finance"."accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "finance"."sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "finance"."sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "finance"."verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "finance"."verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "financial_accounts_user_id_idx" ON "finance"."financial_accounts"("user_id");

-- CreateIndex
CREATE INDEX "categories_user_id_idx" ON "finance"."categories"("user_id");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "finance"."categories"("parent_id");

-- CreateIndex
CREATE INDEX "credit_cards_user_id_idx" ON "finance"."credit_cards"("user_id");

-- CreateIndex
CREATE INDEX "invoices_user_id_idx" ON "finance"."invoices"("user_id");

-- CreateIndex
CREATE INDEX "invoices_credit_card_id_idx" ON "finance"."invoices"("credit_card_id");

-- CreateIndex
CREATE INDEX "invoices_payment_account_id_idx" ON "finance"."invoices"("payment_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_credit_card_id_month_year_key" ON "finance"."invoices"("credit_card_id", "month", "year");

-- CreateIndex
CREATE INDEX "recurring_expenses_user_id_idx" ON "finance"."recurring_expenses"("user_id");

-- CreateIndex
CREATE INDEX "recurring_expenses_category_id_idx" ON "finance"."recurring_expenses"("category_id");

-- CreateIndex
CREATE INDEX "recurring_expenses_account_id_idx" ON "finance"."recurring_expenses"("account_id");

-- CreateIndex
CREATE INDEX "recurring_expenses_credit_card_id_idx" ON "finance"."recurring_expenses"("credit_card_id");

-- CreateIndex
CREATE INDEX "people_user_id_idx" ON "finance"."people"("user_id");

-- CreateIndex
CREATE INDEX "debts_user_id_idx" ON "finance"."debts"("user_id");

-- CreateIndex
CREATE INDEX "debts_person_id_idx" ON "finance"."debts"("person_id");

-- CreateIndex
CREATE INDEX "debts_category_id_idx" ON "finance"."debts"("category_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_date_idx" ON "finance"."transactions"("user_id", "date");

-- CreateIndex
CREATE INDEX "transactions_user_id_status_idx" ON "finance"."transactions"("user_id", "status");

-- CreateIndex
CREATE INDEX "transactions_account_id_idx" ON "finance"."transactions"("account_id");

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "finance"."transactions"("category_id");

-- CreateIndex
CREATE INDEX "transactions_credit_card_id_idx" ON "finance"."transactions"("credit_card_id");

-- CreateIndex
CREATE INDEX "transactions_invoice_id_idx" ON "finance"."transactions"("invoice_id");

-- CreateIndex
CREATE INDEX "transactions_recurring_expense_id_idx" ON "finance"."transactions"("recurring_expense_id");

-- CreateIndex
CREATE INDEX "transactions_debt_id_idx" ON "finance"."transactions"("debt_id");

-- CreateIndex
CREATE INDEX "transactions_parent_installment_id_idx" ON "finance"."transactions"("parent_installment_id");

-- AddForeignKey
ALTER TABLE "finance"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."financial_accounts" ADD CONSTRAINT "financial_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "finance"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."credit_cards" ADD CONSTRAINT "credit_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."invoices" ADD CONSTRAINT "invoices_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "finance"."credit_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."invoices" ADD CONSTRAINT "invoices_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "finance"."financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."recurring_expenses" ADD CONSTRAINT "recurring_expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."recurring_expenses" ADD CONSTRAINT "recurring_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."recurring_expenses" ADD CONSTRAINT "recurring_expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance"."financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."recurring_expenses" ADD CONSTRAINT "recurring_expenses_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "finance"."credit_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."people" ADD CONSTRAINT "people_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."debts" ADD CONSTRAINT "debts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."debts" ADD CONSTRAINT "debts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "finance"."people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."debts" ADD CONSTRAINT "debts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance"."financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "finance"."credit_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "finance"."invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_recurring_expense_id_fkey" FOREIGN KEY ("recurring_expense_id") REFERENCES "finance"."recurring_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "finance"."debts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_parent_installment_id_fkey" FOREIGN KEY ("parent_installment_id") REFERENCES "finance"."transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
