/*
  Warnings:

  - A unique constraint covering the columns `[userId,organisationId]` on the table `WhatsAppOptInWindow` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `organisationId` to the `WhatsAppOptInWindow` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "WhatsAppOptInWindow_userId_key";

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Douala';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'fr';

-- AlterTable
ALTER TABLE "WhatsAppOptInWindow" ADD COLUMN     "organisationId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "WhatsAppOptInWindow_userId_idx" ON "WhatsAppOptInWindow"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppOptInWindow_userId_organisationId_key" ON "WhatsAppOptInWindow"("userId", "organisationId");

-- AddForeignKey
ALTER TABLE "WhatsAppOptInWindow" ADD CONSTRAINT "WhatsAppOptInWindow_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
