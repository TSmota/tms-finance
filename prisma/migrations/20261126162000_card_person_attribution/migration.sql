-- AlterTable
ALTER TABLE "finance"."credit_cards" ADD COLUMN     "default_person_id" UUID;

-- AlterTable
ALTER TABLE "finance"."transactions" ADD COLUMN     "person_id" UUID;

-- CreateIndex
CREATE INDEX "credit_cards_default_person_id_idx" ON "finance"."credit_cards"("default_person_id");

-- CreateIndex
CREATE INDEX "transactions_person_id_idx" ON "finance"."transactions"("person_id");

-- AddForeignKey
ALTER TABLE "finance"."credit_cards" ADD CONSTRAINT "credit_cards_default_person_id_fkey" FOREIGN KEY ("default_person_id") REFERENCES "finance"."people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "finance"."people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
