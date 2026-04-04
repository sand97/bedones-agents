-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'VERIFIED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INVITED');

-- AlterTable
ALTER TABLE "OrganisationMember" ADD COLUMN     "status" "MemberStatus" NOT NULL DEFAULT 'INVITED',
ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'VERIFIED',
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- Set existing OrganisationMembers to ACTIVE (they were created before the invitation system)
UPDATE "OrganisationMember" SET "status" = 'ACTIVE';

-- Set existing owners back to OWNER role default
UPDATE "OrganisationMember" SET "role" = 'OWNER' WHERE "role" = 'OWNER';
