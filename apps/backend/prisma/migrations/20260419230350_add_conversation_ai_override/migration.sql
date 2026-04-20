-- CreateEnum
CREATE TYPE "AiConversationOverride" AS ENUM ('FORCE_ON', 'FORCE_OFF');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "aiOverride" "AiConversationOverride";
