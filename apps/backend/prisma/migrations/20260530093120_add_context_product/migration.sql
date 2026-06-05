-- CreateTable
CREATE TABLE "ProductContext" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "providerProductId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionContext" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "providerCollectionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPostLink" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "providerProductId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPostLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPostLink" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "providerCollectionId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionPostLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductContext_catalogId_idx" ON "ProductContext"("catalogId");

-- CreateIndex
CREATE INDEX "ProductContext_catalogId_content_idx" ON "ProductContext"("catalogId", "content");

-- CreateIndex
CREATE UNIQUE INDEX "ProductContext_catalogId_providerProductId_key" ON "ProductContext"("catalogId", "providerProductId");

-- CreateIndex
CREATE INDEX "CollectionContext_catalogId_idx" ON "CollectionContext"("catalogId");

-- CreateIndex
CREATE INDEX "CollectionContext_catalogId_content_idx" ON "CollectionContext"("catalogId", "content");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionContext_catalogId_providerCollectionId_key" ON "CollectionContext"("catalogId", "providerCollectionId");

-- CreateIndex
CREATE INDEX "ProductPostLink_catalogId_providerProductId_idx" ON "ProductPostLink"("catalogId", "providerProductId");

-- CreateIndex
CREATE INDEX "ProductPostLink_postId_idx" ON "ProductPostLink"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPostLink_catalogId_providerProductId_postId_key" ON "ProductPostLink"("catalogId", "providerProductId", "postId");

-- CreateIndex
CREATE INDEX "CollectionPostLink_catalogId_providerCollectionId_idx" ON "CollectionPostLink"("catalogId", "providerCollectionId");

-- CreateIndex
CREATE INDEX "CollectionPostLink_postId_idx" ON "CollectionPostLink"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPostLink_catalogId_providerCollectionId_postId_key" ON "CollectionPostLink"("catalogId", "providerCollectionId", "postId");

-- AddForeignKey
ALTER TABLE "ProductContext" ADD CONSTRAINT "ProductContext_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionContext" ADD CONSTRAINT "CollectionContext_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPostLink" ADD CONSTRAINT "ProductPostLink_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPostLink" ADD CONSTRAINT "ProductPostLink_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPostLink" ADD CONSTRAINT "CollectionPostLink_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPostLink" ADD CONSTRAINT "CollectionPostLink_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
