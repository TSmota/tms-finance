-- CreateTable
CREATE TABLE "finance"."transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "source_account_id" UUID NOT NULL,
    "destination_account_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "finance"."Currency" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."savings_goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "currency" "finance"."Currency" NOT NULL,
    "target_amount" DECIMAL(12,2) NOT NULL,
    "due_date" TIMESTAMP(3),
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."savings_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "goal_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."payment_batches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "transaction_ids" UUID[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transfers_user_id_date_idx" ON "finance"."transfers"("user_id", "date");

-- CreateIndex
CREATE INDEX "transfers_source_account_id_idx" ON "finance"."transfers"("source_account_id");

-- CreateIndex
CREATE INDEX "transfers_destination_account_id_idx" ON "finance"."transfers"("destination_account_id");

-- CreateIndex
CREATE INDEX "savings_goals_user_id_idx" ON "finance"."savings_goals"("user_id");

-- CreateIndex
CREATE INDEX "savings_entries_goal_id_date_idx" ON "finance"."savings_entries"("goal_id", "date");

-- CreateIndex
CREATE INDEX "payment_batches_user_id_idx" ON "finance"."payment_batches"("user_id");

-- AddForeignKey
ALTER TABLE "finance"."transfers" ADD CONSTRAINT "transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transfers" ADD CONSTRAINT "transfers_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "finance"."financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transfers" ADD CONSTRAINT "transfers_destination_account_id_fkey" FOREIGN KEY ("destination_account_id") REFERENCES "finance"."financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."savings_goals" ADD CONSTRAINT "savings_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."savings_entries" ADD CONSTRAINT "savings_entries_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "finance"."savings_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."payment_batches" ADD CONSTRAINT "payment_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "finance"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RN-06: duas pontas distintas, mesmo valor positivo.
ALTER TABLE finance.transfers ADD CONSTRAINT transfers_amount_check CHECK (amount > 0);
ALTER TABLE finance.transfers ADD CONSTRAINT transfers_accounts_check CHECK (source_account_id <> destination_account_id);
ALTER TABLE finance.savings_goals ADD CONSTRAINT savings_goals_target_check CHECK (target_amount > 0);
ALTER TABLE finance.savings_entries ADD CONSTRAINT savings_entries_amount_check CHECK (amount <> 0);
ALTER TABLE finance.agent_tokens DROP CONSTRAINT agent_tokens_scopes_known;
ALTER TABLE finance.agent_tokens ADD CONSTRAINT agent_tokens_scopes_known CHECK (scopes <@ ARRAY[
  'finance:read', 'transactions:write', 'cards:write', 'invoices:pay', 'debts:write',
  'recurring:write', 'setup:write', 'destructive:write', 'transfers:write', 'goals:write', 'payments:write'
]::text[]);
