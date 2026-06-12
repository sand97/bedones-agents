-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN "collectionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
