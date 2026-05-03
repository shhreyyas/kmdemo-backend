-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Booking_businessId_completedAt_idx" ON "Booking"("businessId", "completedAt");
