-- DropIndex
DROP INDEX IF EXISTS "DirectMessage_localId_key";

-- AlterTable
ALTER TABLE "DirectMessage" DROP COLUMN IF EXISTS "localId";
