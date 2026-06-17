-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "finance";

-- CreateEnum
CREATE TYPE "finance"."AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'INVESTMENT', 'CASH');

-- CreateEnum
CREATE TYPE "finance"."TransactionType" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "finance"."RecurrenceInterval" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "finance"."DebtStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

-- CreateTable
CREATE TABLE "finance"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "password_hash" TEXT,
    "preferred_currency" TEXT NOT NULL DEFAULT 'BRL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
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
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
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
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "finance"."AccountType" NOT NULL,
    "currency" TEXT NOT NULL,
    "initial_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."balance_snapshots" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "balance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#868e96',
    "user_id" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."transactions" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" "finance"."TransactionType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "fx_rate_at_creation" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "account_id" TEXT NOT NULL,
    "category_id" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."recurring_expenses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "interval" "finance"."RecurrenceInterval" NOT NULL DEFAULT 'MONTHLY',
    "next_due_date" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "category_id" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."debts" (
    "id" TEXT NOT NULL,
    "debtor_name" TEXT NOT NULL,
    "description" TEXT,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" "finance"."DebtStatus" NOT NULL DEFAULT 'PENDING',
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."debt_payments" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "fx_rate_at_creation" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "debt_id" TEXT NOT NULL,

    CONSTRAINT "debt_payments_pkey" PRIMARY KEY ("id")
);

-- Migrate data from legacy camelCase tables to snake_case tables.
INSERT INTO "finance"."users" (
    "id",
    "name",
    "email",
    "email_verified",
    "image",
    "password_hash",
    "preferred_currency",
    "created_at"
)
SELECT
    "id",
    "name",
    "email",
    "emailVerified",
    "image",
    "passwordHash",
    "preferredCurrency",
    "createdAt"
FROM "User";

INSERT INTO "finance"."accounts" (
    "id",
    "user_id",
    "type",
    "provider",
    "provider_account_id",
    "refresh_token",
    "access_token",
    "expires_at",
    "token_type",
    "scope",
    "id_token",
    "session_state"
)
SELECT
    "id",
    "userId",
    "type",
    "provider",
    "providerAccountId",
    "refresh_token",
    "access_token",
    "expires_at",
    "token_type",
    "scope",
    "id_token",
    "session_state"
FROM "Account";

INSERT INTO "finance"."sessions" (
    "id",
    "session_token",
    "user_id",
    "expires"
)
SELECT
    "id",
    "sessionToken",
    "userId",
    "expires"
FROM "Session";

INSERT INTO "finance"."verification_tokens" (
    "identifier",
    "token",
    "expires"
)
SELECT
    "identifier",
    "token",
    "expires"
FROM "VerificationToken";

INSERT INTO "finance"."financial_accounts" (
    "id",
    "name",
    "type",
    "currency",
    "initial_balance",
    "user_id",
    "created_at"
)
SELECT
    "id",
    "name",
    CASE WHEN "type"::text = 'CREDIT_CARD' THEN 'CASH' ELSE "type"::text END::"finance"."AccountType",
    "currency",
    "initialBalance",
    "userId",
    "createdAt"
FROM "FinancialAccount";

INSERT INTO "finance"."balance_snapshots" (
    "id",
    "amount",
    "created_at",
    "account_id"
)
SELECT
    "id",
    "amount",
    "createdAt",
    "accountId"
FROM "BalanceSnapshot";

INSERT INTO "finance"."categories" (
    "id",
    "name",
    "color",
    "user_id"
)
SELECT
    "id",
    "name",
    "color",
    "userId"
FROM "Category";

INSERT INTO "finance"."transactions" (
    "id",
    "amount",
    "type",
    "date",
    "description",
    "fx_rate_at_creation",
    "account_id",
    "category_id",
    "user_id",
    "created_at"
)
SELECT
    "id",
    "amount",
    "type"::text::"finance"."TransactionType",
    "date",
    "description",
    "fxRateAtCreation",
    "accountId",
    "categoryId",
    "userId",
    "createdAt"
FROM "Transaction";

INSERT INTO "finance"."recurring_expenses" (
    "id",
    "name",
    "amount",
    "currency",
    "interval",
    "next_due_date",
    "active",
    "category_id",
    "user_id"
)
SELECT
    "id",
    "name",
    "amount",
    "currency",
    "interval"::text::"finance"."RecurrenceInterval",
    "nextDueDate",
    "active",
    "categoryId",
    "userId"
FROM "RecurringExpense";

INSERT INTO "finance"."debts" (
    "id",
    "debtor_name",
    "description",
    "total_amount",
    "currency",
    "due_date",
    "status",
    "user_id",
    "created_at"
)
SELECT
    "id",
    "debtorName",
    "description",
    "totalAmount",
    "currency",
    "dueDate",
    "status"::text::"finance"."DebtStatus",
    "userId",
    "createdAt"
FROM "Debt";

INSERT INTO "finance"."debt_payments" (
    "id",
    "amount",
    "payment_date",
    "fx_rate_at_creation",
    "debt_id"
)
SELECT
    "id",
    "amount",
    "paymentDate",
    "fxRateAtCreation",
    "debtId"
FROM "DebtPayment";

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "finance"."users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "finance"."accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "finance"."accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "finance"."sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "finance"."verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "finance"."verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "financial_accounts_user_id_idx" ON "finance"."financial_accounts"("user_id");

-- CreateIndex
CREATE INDEX "balance_snapshots_account_id_idx" ON "finance"."balance_snapshots"("account_id");

-- CreateIndex
CREATE INDEX "categories_user_id_idx" ON "finance"."categories"("user_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_date_idx" ON "finance"."transactions"("user_id", "date");

-- CreateIndex
CREATE INDEX "transactions_account_id_idx" ON "finance"."transactions"("account_id");

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "finance"."transactions"("category_id");

-- CreateIndex
CREATE INDEX "recurring_expenses_user_id_idx" ON "finance"."recurring_expenses"("user_id");

-- CreateIndex
CREATE INDEX "recurring_expenses_category_id_idx" ON "finance"."recurring_expenses"("category_id");

-- CreateIndex
CREATE INDEX "debts_user_id_idx" ON "finance"."debts"("user_id");

-- CreateIndex
CREATE INDEX "debt_payments_debt_id_idx" ON "finance"."debt_payments"("debt_id");

-- AddForeignKey
ALTER TABLE "finance"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."financial_accounts" ADD CONSTRAINT "financial_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance"."financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance"."financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."recurring_expenses" ADD CONSTRAINT "recurring_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."recurring_expenses" ADD CONSTRAINT "recurring_expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."debts" ADD CONSTRAINT "debts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."debt_payments" ADD CONSTRAINT "debt_payments_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "finance"."debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove legacy camelCase tables and enums after successful migration.
DROP TABLE IF EXISTS "finance"."DebtPayment";
DROP TABLE IF EXISTS "finance"."Debt";
DROP TABLE IF EXISTS "finance"."RecurringExpense";
DROP TABLE IF EXISTS "finance"."Transaction";
DROP TABLE IF EXISTS "finance"."Category";
DROP TABLE IF EXISTS "finance"."BalanceSnapshot";
DROP TABLE IF EXISTS "finance"."FinancialAccount";
DROP TABLE IF EXISTS "finance"."VerificationToken";
DROP TABLE IF EXISTS "finance"."Session";
DROP TABLE IF EXISTS "finance"."Account";
DROP TABLE IF EXISTS "finance"."User";
DROP TABLE IF EXISTS "DebtPayment";
DROP TABLE IF EXISTS "Debt";
DROP TABLE IF EXISTS "RecurringExpense";
DROP TABLE IF EXISTS "Transaction";
DROP TABLE IF EXISTS "Category";
DROP TABLE IF EXISTS "BalanceSnapshot";
DROP TABLE IF EXISTS "FinancialAccount";
DROP TABLE IF EXISTS "VerificationToken";
DROP TABLE IF EXISTS "Session";
DROP TABLE IF EXISTS "Account";
DROP TABLE IF EXISTS "User";
