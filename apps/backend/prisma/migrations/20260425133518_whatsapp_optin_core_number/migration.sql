/*
  Warnings:

  - You are about to drop the column `socialAccountId` on the `WhatsAppOptInWindow` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `WhatsAppOptInWindow` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "WhatsAppOptInWindow" DROP CONSTRAINT "WhatsAppOptInWindow_socialAccountId_fkey";

-- DropIndex
DROP INDEX "WhatsAppOptInWindow_socialAccountId_idx";

-- DropIndex
DROP INDEX "WhatsAppOptInWindow_userId_socialAccountId_key";

-- AlterTable
ALTER TABLE "WhatsAppOptInWindow" DROP COLUMN "socialAccountId";

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppOptInWindow_userId_key" ON "WhatsAppOptInWindow"("userId");
