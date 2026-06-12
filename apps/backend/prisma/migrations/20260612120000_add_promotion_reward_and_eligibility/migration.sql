-- CreateEnum
CREATE TYPE "PromotionRewardType" AS ENUM ('PRODUCTS', 'CREDIT', 'PERCENT');

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN "minOrderAmount" DOUBLE PRECISION,
ADD COLUMN "minItemCount" INTEGER,
ADD COLUMN "rewardType" "PromotionRewardType",
ADD COLUMN "rewardCredit" DOUBLE PRECISION,
ADD COLUMN "rewardPercent" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PromotionRewardProduct" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "PromotionRewardProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromotionRewardProduct_promotionId_idx" ON "PromotionRewardProduct"("promotionId");

-- CreateIndex
CREATE INDEX "PromotionRewardProduct_productId_idx" ON "PromotionRewardProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRewardProduct_promotionId_productId_key" ON "PromotionRewardProduct"("promotionId", "productId");

-- AddForeignKey
ALTER TABLE "PromotionRewardProduct" ADD CONSTRAINT "PromotionRewardProduct_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRewardProduct" ADD CONSTRAINT "PromotionRewardProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
