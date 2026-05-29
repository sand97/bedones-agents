-- CreateEnum
CREATE TYPE "LoyaltyTargetType" AS ENUM ('SPEND', 'ORDER_COUNT', 'PRODUCTS');

-- CreateEnum
CREATE TYPE "LoyaltyRewardType" AS ENUM ('PRODUCTS', 'CREDIT', 'PERCENT');

-- CreateEnum
CREATE TYPE "LoyaltyBonusStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LoyaltyCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "LoyaltyCampaignFrequency" AS ENUM ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "LoyaltyContact" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyBonus" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "LoyaltyBonusStatus" NOT NULL DEFAULT 'DRAFT',
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "targetSpend" DOUBLE PRECISION,
    "targetOrderCount" INTEGER,
    "targetProductsCount" INTEGER,
    "rewardType" "LoyaltyRewardType" NOT NULL,
    "rewardCredit" DOUBLE PRECISION,
    "rewardPercent" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyBonusTriggerProduct" (
    "id" TEXT NOT NULL,
    "bonusId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "LoyaltyBonusTriggerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyBonusRewardProduct" (
    "id" TEXT NOT NULL,
    "bonusId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "LoyaltyBonusRewardProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTemplate" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "metaTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "category" TEXT NOT NULL DEFAULT 'MARKETING',
    "body" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyCampaign" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "bonusId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "status" "LoyaltyCampaignStatus" NOT NULL DEFAULT 'SCHEDULED',
    "frequency" "LoyaltyCampaignFrequency" NOT NULL DEFAULT 'ONCE',
    "segmentCriteria" JSONB,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "repliedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyContact_socialAccountId_idx" ON "LoyaltyContact"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyContact_socialAccountId_phone_key" ON "LoyaltyContact"("socialAccountId", "phone");

-- CreateIndex
CREATE INDEX "LoyaltyBonus_socialAccountId_idx" ON "LoyaltyBonus"("socialAccountId");

-- CreateIndex
CREATE INDEX "LoyaltyBonus_status_idx" ON "LoyaltyBonus"("status");

-- CreateIndex
CREATE INDEX "LoyaltyBonusTriggerProduct_bonusId_idx" ON "LoyaltyBonusTriggerProduct"("bonusId");

-- CreateIndex
CREATE INDEX "LoyaltyBonusTriggerProduct_productId_idx" ON "LoyaltyBonusTriggerProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyBonusTriggerProduct_bonusId_productId_key" ON "LoyaltyBonusTriggerProduct"("bonusId", "productId");

-- CreateIndex
CREATE INDEX "LoyaltyBonusRewardProduct_bonusId_idx" ON "LoyaltyBonusRewardProduct"("bonusId");

-- CreateIndex
CREATE INDEX "LoyaltyBonusRewardProduct_productId_idx" ON "LoyaltyBonusRewardProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyBonusRewardProduct_bonusId_productId_key" ON "LoyaltyBonusRewardProduct"("bonusId", "productId");

-- CreateIndex
CREATE INDEX "LoyaltyTemplate_socialAccountId_idx" ON "LoyaltyTemplate"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyTemplate_socialAccountId_name_key" ON "LoyaltyTemplate"("socialAccountId", "name");

-- CreateIndex
CREATE INDEX "LoyaltyCampaign_socialAccountId_idx" ON "LoyaltyCampaign"("socialAccountId");

-- CreateIndex
CREATE INDEX "LoyaltyCampaign_bonusId_idx" ON "LoyaltyCampaign"("bonusId");

-- CreateIndex
CREATE INDEX "LoyaltyCampaign_status_idx" ON "LoyaltyCampaign"("status");

-- AddForeignKey
ALTER TABLE "LoyaltyContact" ADD CONSTRAINT "LoyaltyContact_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyBonus" ADD CONSTRAINT "LoyaltyBonus_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyBonusTriggerProduct" ADD CONSTRAINT "LoyaltyBonusTriggerProduct_bonusId_fkey" FOREIGN KEY ("bonusId") REFERENCES "LoyaltyBonus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyBonusTriggerProduct" ADD CONSTRAINT "LoyaltyBonusTriggerProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyBonusRewardProduct" ADD CONSTRAINT "LoyaltyBonusRewardProduct_bonusId_fkey" FOREIGN KEY ("bonusId") REFERENCES "LoyaltyBonus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyBonusRewardProduct" ADD CONSTRAINT "LoyaltyBonusRewardProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTemplate" ADD CONSTRAINT "LoyaltyTemplate_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyCampaign" ADD CONSTRAINT "LoyaltyCampaign_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyCampaign" ADD CONSTRAINT "LoyaltyCampaign_bonusId_fkey" FOREIGN KEY ("bonusId") REFERENCES "LoyaltyBonus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyCampaign" ADD CONSTRAINT "LoyaltyCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LoyaltyTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
