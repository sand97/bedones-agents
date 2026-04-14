-- AlterTable
ALTER TABLE "AgentSocialAccount" ALTER COLUMN "aiActivationContacts" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "deliveryStatus" TEXT;
