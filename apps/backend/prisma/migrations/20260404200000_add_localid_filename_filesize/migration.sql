-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "localId" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSize" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "DirectMessage_localId_key" ON "DirectMessage"("localId");
