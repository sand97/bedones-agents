-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "additionalImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
