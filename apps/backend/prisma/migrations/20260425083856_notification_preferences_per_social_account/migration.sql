/*
  Warnings:

  - You are about to drop the column `emailNewFeatures` on the `NotificationPreference` table. All the data in the column will be lost.
  - You are about to drop the column `emailNewOffers` on the `NotificationPreference` table. All the data in the column will be lost.
  - You are about to drop the column `emailTutorials` on the `NotificationPreference` table. All the data in the column will be lost.
  - You are about to drop the column `waAgentAlert` on the `NotificationPreference` table. All the data in the column will be lost.
  - You are about to drop the column `waDailySummary` on the `NotificationPreference` table. All the data in the column will be lost.
  - You are about to drop the column `waNewComment` on the `NotificationPreference` table. All the data in the column will be lost.
  - You are about to drop the column `waNewMessage` on the `NotificationPreference` table. All the data in the column will be lost.
  - You are about to drop the column `waTicketAssigned` on the `NotificationPreference` table. All the data in the column will be lost.
  - You are about to drop the column `waTicketUrgent` on the `NotificationPreference` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,socialAccountId,type]` on the table `NotificationPreference` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `socialAccountId` to the `NotificationPreference` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `NotificationPreference` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('COMMENT_TO_READ', 'COMMENT_AI_SUGGESTION', 'COMMENT_DAILY_SUMMARY', 'MESSAGE_TO_READ', 'MESSAGE_AI_SUGGESTION', 'MESSAGE_TICKET_CREATED', 'MESSAGE_TICKET_CLOSED', 'MESSAGE_DAILY_SUMMARY');

-- DropIndex
DROP INDEX "NotificationPreference_userId_key";

-- AlterTable
ALTER TABLE "NotificationPreference" DROP COLUMN "emailNewFeatures",
DROP COLUMN "emailNewOffers",
DROP COLUMN "emailTutorials",
DROP COLUMN "waAgentAlert",
DROP COLUMN "waDailySummary",
DROP COLUMN "waNewComment",
DROP COLUMN "waNewMessage",
DROP COLUMN "waTicketAssigned",
DROP COLUMN "waTicketUrgent",
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "socialAccountId" TEXT NOT NULL,
ADD COLUMN     "type" "NotificationType" NOT NULL;

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "NotificationPreference_socialAccountId_idx" ON "NotificationPreference"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_socialAccountId_type_key" ON "NotificationPreference"("userId", "socialAccountId", "type");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
