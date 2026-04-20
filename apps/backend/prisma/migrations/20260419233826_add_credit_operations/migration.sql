-- CreateEnum
CREATE TYPE "CreditMediaType" AS ENUM ('TEXT', 'AUDIO', 'IMAGE');

-- CreateTable
CREATE TABLE "CreditOperation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "agentId" TEXT,
    "conversationId" TEXT,
    "commentId" TEXT,
    "mediaType" "CreditMediaType" NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditOperation_organisationId_idx" ON "CreditOperation"("organisationId");

-- CreateIndex
CREATE INDEX "CreditOperation_organisationId_createdAt_idx" ON "CreditOperation"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditOperation_createdAt_idx" ON "CreditOperation"("createdAt");

-- AddForeignKey
ALTER TABLE "CreditOperation" ADD CONSTRAINT "CreditOperation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditOperation" ADD CONSTRAINT "CreditOperation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
