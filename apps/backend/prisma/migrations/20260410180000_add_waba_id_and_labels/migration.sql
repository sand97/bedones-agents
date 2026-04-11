-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN "wabaId" TEXT;

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#1677ff',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Label_socialAccountId_idx" ON "Label"("socialAccountId");

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
