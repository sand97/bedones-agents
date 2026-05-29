-- Extend existing campaign statuses.
ALTER TYPE "LoyaltyCampaignStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "LoyaltyCampaignStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- Campaign, contact language, and consent enums.
CREATE TYPE "CampaignOrigin" AS ENUM ('LOYALTY', 'GENERAL');
CREATE TYPE "CampaignAudienceType" AS ENUM ('RECENT_CONTACTS', 'PRODUCT_INTEREST', 'TICKET_STATUS');
CREATE TYPE "CampaignContactDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'REPLIED', 'FAILED');
CREATE TYPE "ContactLanguageSource" AS ENUM ('UNKNOWN', 'AI', 'MANUAL', 'IMPORT', 'META');
CREATE TYPE "CommunicationChannel" AS ENUM ('WHATSAPP');
CREATE TYPE "CommunicationPurpose" AS ENUM ('MARKETING', 'UTILITY', 'LOYALTY');
CREATE TYPE "CommunicationPreferenceStatus" AS ENUM ('OPTED_IN', 'OPTED_OUT');

-- Contact language lives on Conversation because one WhatsApp contact maps to
-- one conversation per social account.
ALTER TABLE "Conversation"
  ADD COLUMN "languageCode" TEXT,
  ADD COLUMN "languageSource" "ContactLanguageSource" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "languageConfidence" DOUBLE PRECISION,
  ADD COLUMN "languageDetectedAt" TIMESTAMP(3);

-- Generalize LoyaltyCampaign so loyalty and marketing campaigns share one result
-- model and statistics pipeline.
ALTER TABLE "LoyaltyCampaign" DROP CONSTRAINT IF EXISTS "LoyaltyCampaign_bonusId_fkey";
ALTER TABLE "LoyaltyCampaign" ALTER COLUMN "bonusId" DROP NOT NULL;
ALTER TABLE "LoyaltyCampaign"
  ADD COLUMN "origin" "CampaignOrigin" NOT NULL DEFAULT 'LOYALTY',
  ADD COLUMN "marketingTopic" TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN "audienceType" "CampaignAudienceType",
  ADD COLUMN "audienceCriteria" JSONB,
  ADD COLUMN "audienceLimit" INTEGER,
  ADD COLUMN "templateAssignments" JSONB,
  ADD COLUMN "variableValues" JSONB;
ALTER TABLE "LoyaltyCampaign" ADD CONSTRAINT "LoyaltyCampaign_bonusId_fkey" FOREIGN KEY ("bonusId") REFERENCES "LoyaltyBonus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "LoyaltyCampaign_origin_idx" ON "LoyaltyCampaign"("origin");

CREATE TABLE "LoyaltyCampaignContact" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "directMessageId" TEXT,
  "contactPhone" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "languageCode" TEXT,
  "templateId" TEXT,
  "templateName" TEXT,
  "templateLanguage" TEXT,
  "platformMsgId" TEXT,
  "status" "CampaignContactDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "repliedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LoyaltyCampaignContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoyaltyCampaignContact_directMessageId_key" ON "LoyaltyCampaignContact"("directMessageId");
CREATE UNIQUE INDEX "LoyaltyCampaignContact_platformMsgId_key" ON "LoyaltyCampaignContact"("platformMsgId");
CREATE UNIQUE INDEX "LoyaltyCampaignContact_campaignId_conversationId_key" ON "LoyaltyCampaignContact"("campaignId", "conversationId");
CREATE INDEX "LoyaltyCampaignContact_campaignId_idx" ON "LoyaltyCampaignContact"("campaignId");
CREATE INDEX "LoyaltyCampaignContact_campaignId_status_idx" ON "LoyaltyCampaignContact"("campaignId", "status");
CREATE INDEX "LoyaltyCampaignContact_conversationId_idx" ON "LoyaltyCampaignContact"("conversationId");
CREATE INDEX "LoyaltyCampaignContact_platformMsgId_idx" ON "LoyaltyCampaignContact"("platformMsgId");

ALTER TABLE "LoyaltyCampaignContact" ADD CONSTRAINT "LoyaltyCampaignContact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "LoyaltyCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyCampaignContact" ADD CONSTRAINT "LoyaltyCampaignContact_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyCampaignContact" ADD CONSTRAINT "LoyaltyCampaignContact_directMessageId_fkey" FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ContactCommunicationPreference" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "channel" "CommunicationChannel" NOT NULL DEFAULT 'WHATSAPP',
  "purpose" "CommunicationPurpose" NOT NULL,
  "topic" TEXT NOT NULL DEFAULT 'general',
  "status" "CommunicationPreferenceStatus" NOT NULL,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContactCommunicationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactCommunicationPreference_conversationId_channel_purpose_topic_key" ON "ContactCommunicationPreference"("conversationId", "channel", "purpose", "topic");
CREATE INDEX "ContactCommunicationPreference_socialAccountId_idx" ON "ContactCommunicationPreference"("socialAccountId");
CREATE INDEX "ContactCommunicationPreference_socialAccountId_purpose_topic_status_idx" ON "ContactCommunicationPreference"("socialAccountId", "purpose", "topic", "status");

ALTER TABLE "ContactCommunicationPreference" ADD CONSTRAINT "ContactCommunicationPreference_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactCommunicationPreference" ADD CONSTRAINT "ContactCommunicationPreference_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContactConsentEvent" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT,
  "socialAccountId" TEXT NOT NULL,
  "campaignId" TEXT,
  "channel" "CommunicationChannel" NOT NULL DEFAULT 'WHATSAPP',
  "purpose" "CommunicationPurpose" NOT NULL,
  "topic" TEXT NOT NULL DEFAULT 'general',
  "action" TEXT NOT NULL,
  "source" TEXT,
  "rawText" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContactConsentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactConsentEvent_conversationId_idx" ON "ContactConsentEvent"("conversationId");
CREATE INDEX "ContactConsentEvent_socialAccountId_idx" ON "ContactConsentEvent"("socialAccountId");
CREATE INDEX "ContactConsentEvent_campaignId_idx" ON "ContactConsentEvent"("campaignId");
CREATE INDEX "ContactConsentEvent_purpose_topic_idx" ON "ContactConsentEvent"("purpose", "topic");

ALTER TABLE "ContactConsentEvent" ADD CONSTRAINT "ContactConsentEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactConsentEvent" ADD CONSTRAINT "ContactConsentEvent_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactConsentEvent" ADD CONSTRAINT "ContactConsentEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "LoyaltyCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
