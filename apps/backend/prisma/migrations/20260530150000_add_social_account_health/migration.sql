-- CreateEnum
CREATE TYPE "SocialFeature" AS ENUM ('COMMENT', 'MESSAGE');

-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "disabledReason" TEXT,
ADD COLUMN     "featureDisabled" "SocialFeature"[];

-- CreateTable
CREATE TABLE "SocialAccountErrorLog" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "feature" "SocialFeature",
    "operation" TEXT,
    "resource" TEXT,
    "errorCode" TEXT,
    "errorTrace" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAccountErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderErrorMessage" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "errorCode" TEXT,
    "resource" TEXT,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderErrorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialAccountErrorLog_socialAccountId_createdAt_idx" ON "SocialAccountErrorLog"("socialAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderErrorMessage_signature_key" ON "ProviderErrorMessage"("signature");

-- AddForeignKey
ALTER TABLE "SocialAccountErrorLog" ADD CONSTRAINT "SocialAccountErrorLog_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

