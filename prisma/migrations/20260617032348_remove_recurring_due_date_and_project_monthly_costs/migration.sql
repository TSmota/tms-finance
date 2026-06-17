/*
  Warnings:

  - You are about to drop the column `next_due_date` on the `recurring_expenses` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "finance"."recurring_expenses" DROP COLUMN "next_due_date";
