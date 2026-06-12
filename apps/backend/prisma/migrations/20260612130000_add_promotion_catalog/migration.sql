-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN "catalogId" TEXT;

-- CreateIndex
CREATE INDEX "Promotion_catalogId_idx" ON "Promotion"("catalogId");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
