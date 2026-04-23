-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED');

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3),
    "eventLocation" TEXT,
    "functionType" TEXT,
    "guestCount" INTEGER,
    "notes" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "dishId" TEXT,
    "parentDishId" TEXT,
    "isTemplate" BOOLEAN,
    "eventTotal" DECIMAL(12,2),
    "eventSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingEvent_bookingId_idx" ON "BookingEvent"("bookingId");

-- CreateIndex
CREATE INDEX "BookingEvent_bookingId_eventAt_idx" ON "BookingEvent"("bookingId", "eventAt");

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
