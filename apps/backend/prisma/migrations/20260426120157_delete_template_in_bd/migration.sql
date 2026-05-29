/*
  Warnings:

  - You are about to drop the column `templateId` on the `LoyaltyCampaign` table. All the data in the column will be lost.
  - You are about to drop the `LoyaltyTemplate` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "LoyaltyCampaign" DROP CONSTRAINT "LoyaltyCampaign_templateId_fkey";

-- DropForeignKey
ALTER TABLE "LoyaltyTemplate" DROP CONSTRAINT "LoyaltyTemplate_socialAccountId_fkey";

-- AlterTable
ALTER TABLE "LoyaltyCampaign" DROP COLUMN "templateId",
ADD COLUMN     "metaTemplateId" TEXT,
ADD COLUMN     "metaTemplateLanguage" TEXT,
ADD COLUMN     "metaTemplateName" TEXT;

-- DropTable
DROP TABLE "LoyaltyTemplate";
