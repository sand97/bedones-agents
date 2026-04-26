-- CreateTable
CREATE TABLE "WhatsAppOptInWindow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastInboundAt" TIMESTAMP(3),
    "lastTemplateSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppOptInWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppOptInWindow_expiresAt_idx" ON "WhatsAppOptInWindow"("expiresAt");

-- CreateIndex
CREATE INDEX "WhatsAppOptInWindow_socialAccountId_idx" ON "WhatsAppOptInWindow"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppOptInWindow_userId_socialAccountId_key" ON "WhatsAppOptInWindow"("userId", "socialAccountId");

-- AddForeignKey
ALTER TABLE "WhatsAppOptInWindow" ADD CONSTRAINT "WhatsAppOptInWindow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppOptInWindow" ADD CONSTRAINT "WhatsAppOptInWindow_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
