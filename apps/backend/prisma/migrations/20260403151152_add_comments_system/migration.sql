-- CreateEnum
CREATE TYPE "CommentAction" AS ENUM ('NONE', 'HIDE', 'DELETE', 'REPLY');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'DELETED');

-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "profilePictureUrl" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "PageSettings" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "undesiredCommentsAction" TEXT NOT NULL DEFAULT 'hide',
    "spamAction" TEXT NOT NULL DEFAULT 'delete',
    "customInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FAQRule" (
    "id" TEXT NOT NULL,
    "pageSettingsId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FAQRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "message" TEXT,
    "imageUrl" TEXT,
    "permalinkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "parentId" TEXT,
    "message" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromAvatar" TEXT,
    "createdTime" TIMESTAMP(3) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isPageReply" BOOLEAN NOT NULL DEFAULT false,
    "status" "CommentStatus" NOT NULL DEFAULT 'VISIBLE',
    "action" "CommentAction" NOT NULL DEFAULT 'NONE',
    "actionReason" TEXT,
    "replyMessage" TEXT,
    "permalinkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PageSettings_socialAccountId_key" ON "PageSettings"("socialAccountId");

-- CreateIndex
CREATE INDEX "FAQRule_pageSettingsId_idx" ON "FAQRule"("pageSettingsId");

-- CreateIndex
CREATE INDEX "Post_socialAccountId_idx" ON "Post"("socialAccountId");

-- CreateIndex
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");

-- CreateIndex
CREATE INDEX "Comment_fromId_idx" ON "Comment"("fromId");

-- CreateIndex
CREATE INDEX "Comment_createdTime_idx" ON "Comment"("createdTime");

-- AddForeignKey
ALTER TABLE "PageSettings" ADD CONSTRAINT "PageSettings_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FAQRule" ADD CONSTRAINT "FAQRule_pageSettingsId_fkey" FOREIGN KEY ("pageSettingsId") REFERENCES "PageSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
