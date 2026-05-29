-- AlterTable
ALTER TABLE "PageSettings" ADD COLUMN     "catalogId" TEXT;

-- CreateIndex
CREATE INDEX "PageSettings_catalogId_idx" ON "PageSettings"("catalogId");

-- AddForeignKey
ALTER TABLE "PageSettings" ADD CONSTRAINT "PageSettings_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
