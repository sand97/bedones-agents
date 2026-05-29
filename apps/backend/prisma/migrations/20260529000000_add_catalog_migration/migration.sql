-- CreateEnum
CREATE TYPE "CatalogMigrationStatus" AS ENUM ('QUEUED', 'EXTRACTING', 'IMPORTING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "CatalogMigration" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "sourcePhone" TEXT NOT NULL,
    "sourceSocialAccountId" TEXT,
    "status" "CatalogMigrationStatus" NOT NULL DEFAULT 'QUEUED',
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "importedProducts" INTEGER NOT NULL DEFAULT 0,
    "failedProducts" INTEGER NOT NULL DEFAULT 0,
    "jobId" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogMigration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogMigration_organisationId_idx" ON "CatalogMigration"("organisationId");

-- CreateIndex
CREATE INDEX "CatalogMigration_catalogId_idx" ON "CatalogMigration"("catalogId");

-- CreateIndex
CREATE INDEX "CatalogMigration_status_idx" ON "CatalogMigration"("status");

-- AddForeignKey
ALTER TABLE "CatalogMigration" ADD CONSTRAINT "CatalogMigration_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogMigration" ADD CONSTRAINT "CatalogMigration_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
