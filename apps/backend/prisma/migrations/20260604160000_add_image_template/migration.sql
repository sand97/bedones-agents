-- CreateTable
CREATE TABLE "ImageTemplate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT '1:1',
    "accent" TEXT,
    "definition" JSONB NOT NULL,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageTemplate_organisationId_idx" ON "ImageTemplate"("organisationId");

-- CreateIndex
CREATE INDEX "ImageTemplate_catalogId_idx" ON "ImageTemplate"("catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageTemplate_catalogId_sourceKey_key" ON "ImageTemplate"("catalogId", "sourceKey");

-- AddForeignKey
ALTER TABLE "ImageTemplate" ADD CONSTRAINT "ImageTemplate_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
