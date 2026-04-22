-- Add booking-level date range fields for event window
ALTER TABLE "Booking"
ADD COLUMN "eventRangeStart" TIMESTAMP(3),
ADD COLUMN "eventRangeEnd" TIMESTAMP(3);
