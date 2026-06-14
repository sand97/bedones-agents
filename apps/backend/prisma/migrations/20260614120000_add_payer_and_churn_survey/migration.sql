-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "payerUserId" TEXT,
ADD COLUMN "lastReminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChurnSurveyResponse" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT,
    "phone" TEXT,
    "flowToken" TEXT,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurnSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChurnSurveyResponse_organisationId_idx" ON "ChurnSurveyResponse"("organisationId");
