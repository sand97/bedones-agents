-- CreateEnum
CREATE TYPE "AiActivationMode" AS ENUM ('OFF', 'ALL', 'LABELS');

-- AlterTable
ALTER TABLE "AgentSocialAccount" ADD COLUMN     "aiActivationLabels" TEXT[],
ADD COLUMN     "aiActivationMode" "AiActivationMode" NOT NULL DEFAULT 'OFF';

-- CreateTable
CREATE TABLE "ConversationLabel" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationLabel_conversationId_idx" ON "ConversationLabel"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationLabel_labelId_idx" ON "ConversationLabel"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationLabel_conversationId_labelId_key" ON "ConversationLabel"("conversationId", "labelId");

-- AddForeignKey
ALTER TABLE "ConversationLabel" ADD CONSTRAINT "ConversationLabel_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationLabel" ADD CONSTRAINT "ConversationLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;
