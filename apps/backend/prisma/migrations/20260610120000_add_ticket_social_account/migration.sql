-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "socialAccountId" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_socialAccountId_idx" ON "Ticket"("socialAccountId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
