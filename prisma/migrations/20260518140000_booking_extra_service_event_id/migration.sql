-- Per-event additional services (indexed for fast booking loads).
ALTER TABLE "BookingExtraServiceLine" ADD COLUMN "eventId" TEXT;

CREATE INDEX "BookingExtraServiceLine_bookingId_eventId_idx"
  ON "BookingExtraServiceLine"("bookingId", "eventId");

ALTER TABLE "BookingExtraServiceLine"
  ADD CONSTRAINT "BookingExtraServiceLine_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "BookingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill legacy rows to the booking's earliest event (single query per booking via subquery).
UPDATE "BookingExtraServiceLine" AS l
SET "eventId" = sub."eventId"
FROM (
  SELECT DISTINCT ON (e."bookingId")
    e."bookingId",
    e.id AS "eventId"
  FROM "BookingEvent" e
  ORDER BY e."bookingId", e."eventAt" ASC NULLS LAST, e."createdAt" ASC
) AS sub
WHERE l."bookingId" = sub."bookingId"
  AND l."eventId" IS NULL;
