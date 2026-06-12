-- CreateTable
CREATE TABLE "TicketStatusNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "ticketStatusId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "collectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketStatusNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketStatusNotification_userId_idx" ON "TicketStatusNotification"("userId");

-- CreateIndex
CREATE INDEX "TicketStatusNotification_socialAccountId_idx" ON "TicketStatusNotification"("socialAccountId");

-- CreateIndex
CREATE INDEX "TicketStatusNotification_ticketStatusId_idx" ON "TicketStatusNotification"("ticketStatusId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketStatusNotification_userId_socialAccountId_ticketStatu_key" ON "TicketStatusNotification"("userId", "socialAccountId", "ticketStatusId");

-- AddForeignKey
ALTER TABLE "TicketStatusNotification" ADD CONSTRAINT "TicketStatusNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusNotification" ADD CONSTRAINT "TicketStatusNotification_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusNotification" ADD CONSTRAINT "TicketStatusNotification_ticketStatusId_fkey" FOREIGN KEY ("ticketStatusId") REFERENCES "TicketStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

