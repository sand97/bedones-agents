-- CreateEnum
CREATE TYPE "MessageHistorySyncStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'UNSUPPORTED');

-- AlterTable
ALTER TABLE "SocialAccount"
  ADD COLUMN "historySyncStatus" "MessageHistorySyncStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "historySyncedAt" TIMESTAMP(3),
  ADD COLUMN "historySyncError" TEXT;

-- AlterTable
ALTER TABLE "Conversation"
  ADD COLUMN "historySyncedAt" TIMESTAMP(3);
