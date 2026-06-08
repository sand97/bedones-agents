-- AlterTable: new combinable activation scopes on the agent <-> social account link
ALTER TABLE "AgentSocialAccount" ADD COLUMN     "aiActivateAll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentSocialAccount" ADD COLUMN     "aiActivateAds" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentSocialAccount" ADD COLUMN     "aiActivateNewConversations" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentSocialAccount" ADD COLUMN     "aiActivatedAt" TIMESTAMP(3);

-- AlterTable: conversation ad provenance
ALTER TABLE "Conversation" ADD COLUMN     "fromAd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN     "adReferral" JSONB;

-- AlterTable: per-post agent override (FORCE_OFF disables replies to the post's comments)
ALTER TABLE "Post" ADD COLUMN     "aiOverride" "AiConversationOverride";
