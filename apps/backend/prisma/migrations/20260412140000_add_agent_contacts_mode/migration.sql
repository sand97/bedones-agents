-- AlterEnum
ALTER TYPE "AiActivationMode" ADD VALUE 'CONTACTS';
ALTER TYPE "AiActivationMode" ADD VALUE 'EXCLUDE_LABELS';

-- AlterTable
ALTER TABLE "AgentSocialAccount" ADD COLUMN "aiActivationContacts" TEXT[] DEFAULT ARRAY[]::TEXT[];
