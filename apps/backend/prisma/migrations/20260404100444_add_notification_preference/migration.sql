-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "waNewMessage" BOOLEAN NOT NULL DEFAULT true,
    "waNewComment" BOOLEAN NOT NULL DEFAULT false,
    "waTicketAssigned" BOOLEAN NOT NULL DEFAULT true,
    "waTicketUrgent" BOOLEAN NOT NULL DEFAULT true,
    "waAgentAlert" BOOLEAN NOT NULL DEFAULT true,
    "waDailySummary" BOOLEAN NOT NULL DEFAULT false,
    "emailNewFeatures" BOOLEAN NOT NULL DEFAULT true,
    "emailNewOffers" BOOLEAN NOT NULL DEFAULT true,
    "emailTutorials" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
