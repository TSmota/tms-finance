-- Endurecimento da autenticação: teto de tamanho nas colunas de texto,
-- marca de troca de senha e a tabela de rate limit.
--
-- Os ALTER COLUMN abaixo falham se alguma linha já exceder o novo teto. É
-- deliberado: truncar silenciosamente uma descrição é perda de dado, e os
-- limites são folgados para o que os formulários de uma linha produzem.

-- AlterTable
ALTER TABLE "finance"."agent_tokens" ALTER COLUMN "label" SET DATA TYPE VARCHAR(120);

-- AlterTable
ALTER TABLE "finance"."categories" ALTER COLUMN "name" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "icon" SET DATA TYPE VARCHAR(60),
ALTER COLUMN "color" SET DATA TYPE VARCHAR(7);

-- AlterTable
ALTER TABLE "finance"."credit_cards" ALTER COLUMN "name" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "institution" SET DATA TYPE VARCHAR(120);

-- AlterTable
ALTER TABLE "finance"."debts" ALTER COLUMN "description" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "finance"."financial_accounts" ALTER COLUMN "name" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "institution" SET DATA TYPE VARCHAR(120);

-- AlterTable
ALTER TABLE "finance"."people" ALTER COLUMN "name" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "notes" SET DATA TYPE VARCHAR(1000);

-- AlterTable
ALTER TABLE "finance"."recurring_expenses" ALTER COLUMN "description" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "finance"."transactions" ALTER COLUMN "description" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "finance"."users" ADD COLUMN     "password_changed_at" TIMESTAMP(3),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(320),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "image" SET DATA TYPE VARCHAR(2048);

-- CreateTable
CREATE TABLE "finance"."rate_limit_hits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" VARCHAR(32) NOT NULL,
    "key" VARCHAR(320) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_limit_hits_scope_key_created_at_idx" ON "finance"."rate_limit_hits"("scope", "key", "created_at");

-- Escritas à mão: o Zod valida para dar mensagem boa, o CHECK garante que
-- nenhum caminho de código escape. Aqui, que balde e sujeito não sejam vazios —
-- chave em branco juntaria requisições de origens diferentes no mesmo contador.
ALTER TABLE "finance"."rate_limit_hits"
  ADD CONSTRAINT "rate_limit_hits_scope_not_blank_check"
  CHECK (length(btrim("scope")) > 0);

ALTER TABLE "finance"."rate_limit_hits"
  ADD CONSTRAINT "rate_limit_hits_key_not_blank_check"
  CHECK (length(btrim("key")) > 0);
