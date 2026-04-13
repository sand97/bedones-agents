-- DropForeignKey
ALTER TABLE "TicketStatus" DROP CONSTRAINT IF EXISTS "TicketStatus_agentId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "TicketStatus_agentId_idx";

-- AlterTable: add organisationId, make agentId nullable temporarily
ALTER TABLE "TicketStatus" ADD COLUMN "organisationId" TEXT;

-- Migrate data: set organisationId from the Agent's organisationId
UPDATE "TicketStatus" ts
SET "organisationId" = a."organisationId"
FROM "Agent" a
WHERE ts."agentId" = a."id";

-- Drop orphan rows with no matching agent
DELETE FROM "TicketStatus" WHERE "organisationId" IS NULL;

-- Make organisationId required
ALTER TABLE "TicketStatus" ALTER COLUMN "organisationId" SET NOT NULL;

-- Drop the old agentId column
ALTER TABLE "TicketStatus" DROP COLUMN "agentId";

-- CreateIndex
CREATE INDEX "TicketStatus_organisationId_idx" ON "TicketStatus"("organisationId");

-- AddForeignKey
ALTER TABLE "TicketStatus" ADD CONSTRAINT "TicketStatus_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
