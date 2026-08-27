-- CreateEnum
CREATE TYPE "finance"."AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'INVESTMENT', 'CASH');

-- AlterTable
ALTER TABLE "finance"."credit_cards" ADD COLUMN     "credit_limit" DECIMAL(12,2),
ADD COLUMN     "default_payment_account_id" UUID,
ADD COLUMN     "institution" TEXT;

-- AlterTable
ALTER TABLE "finance"."financial_accounts" ADD COLUMN     "institution" TEXT,
ADD COLUMN     "type" "finance"."AccountType" NOT NULL DEFAULT 'CHECKING';

-- CreateIndex
CREATE INDEX "credit_cards_default_payment_account_id_idx" ON "finance"."credit_cards"("default_payment_account_id");

-- AddForeignKey
ALTER TABLE "finance"."credit_cards" ADD CONSTRAINT "credit_cards_default_payment_account_id_fkey" FOREIGN KEY ("default_payment_account_id") REFERENCES "finance"."financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariantes dos campos novos (escritas à mão: o Prisma Schema não expressa CHECK).

-- Limite de crédito, quando informado, tem de ser positivo.
ALTER TABLE "finance"."credit_cards"
  ADD CONSTRAINT "credit_cards_credit_limit_check"
  CHECK ("credit_limit" IS NULL OR "credit_limit" > 0);

-- Instituição em branco é ruído: ou vem preenchida, ou vem nula.
ALTER TABLE "finance"."credit_cards"
  ADD CONSTRAINT "credit_cards_institution_check"
  CHECK ("institution" IS NULL OR length(btrim("institution")) > 0);

ALTER TABLE "finance"."financial_accounts"
  ADD CONSTRAINT "financial_accounts_institution_check"
  CHECK ("institution" IS NULL OR length(btrim("institution")) > 0);
