-- CreateTable
CREATE TABLE "finance"."agent_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_hint" TEXT NOT NULL,
    "scopes" TEXT[],
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."agent_audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_id" UUID,
    "user_id" UUID,
    "tool" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "affected_ids" TEXT[],
    "error_code" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_tokens_token_hash_key" ON "finance"."agent_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "agent_tokens_user_id_idx" ON "finance"."agent_tokens"("user_id");

-- CreateIndex
CREATE INDEX "agent_audit_log_token_id_created_at_idx" ON "finance"."agent_audit_log"("token_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_audit_log_user_id_created_at_idx" ON "finance"."agent_audit_log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_audit_log_created_at_idx" ON "finance"."agent_audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "finance"."agent_tokens" ADD CONSTRAINT "agent_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."agent_audit_log" ADD CONSTRAINT "agent_audit_log_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "finance"."agent_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================
-- Invariantes que o Zod não consegue garantir (ARCHITECTURE §6).
-- Escritas à mão: o Zod valida para dar mensagem boa, o CHECK
-- garante que nenhum caminho de código escape.
-- ============================================================

-- Escopo desconhecido é erro de programação, não estado válido. `<@` é
-- "contido em": recusa o array inteiro se qualquer elemento for estranho.
ALTER TABLE "finance"."agent_tokens"
  ADD CONSTRAINT "agent_tokens_scopes_known"
  CHECK ("scopes" <@ ARRAY[
    'finance:read',
    'transactions:write',
    'cards:write',
    'invoices:pay',
    'debts:write',
    'recurring:write',
    'setup:write',
    'destructive:write'
  ]::text[]);

-- Um token sem escopo nenhum autentica sem autorizar nada: é um token que
-- passa pelo 401 e falha em toda ferramenta. Não deve existir.
ALTER TABLE "finance"."agent_tokens"
  ADD CONSTRAINT "agent_tokens_scopes_not_empty"
  CHECK (array_length("scopes", 1) >= 1);

-- Vocabulário fechado do veredito. CONFIRM_REQUIRED não é falha: é a primeira
-- metade de uma remoção em duas fases.
ALTER TABLE "finance"."agent_audit_log"
  ADD CONSTRAINT "agent_audit_log_verdict_known"
  CHECK ("verdict" IN (
    'OK',
    'CONFIRM_REQUIRED',
    'INVALID_INPUT',
    'FORBIDDEN_SCOPE',
    'RATE_LIMITED',
    'DOMAIN_ERROR',
    'FX_UNAVAILABLE',
    'ERROR'
  ));

-- Duração negativa só sai de relógio quebrado, e envenenaria qualquer média.
ALTER TABLE "finance"."agent_audit_log"
  ADD CONSTRAINT "agent_audit_log_duration_non_negative"
  CHECK ("duration_ms" >= 0);
