-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "notchpayReference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_notchpayReference_key" ON "Payment"("notchpayReference");
