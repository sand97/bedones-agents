-- AlterEnum
ALTER TYPE "AuthType" ADD VALUE 'WHATSAPP';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "phoneCountryCode" TEXT;
ALTER TABLE "User" ADD COLUMN "phoneLocal" TEXT;
