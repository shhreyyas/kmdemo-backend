-- User: optional business + verification metadata
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationStatus" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "userVerifiedAt" TIMESTAMP(3);

ALTER TABLE "User" ALTER COLUMN "businessId" DROP NOT NULL;

-- Business: fields from API doc + subscription trial
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "sameAsOwnerNumber" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "cateringTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT DEFAULT 'trial';
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "subscriptionPlan" TEXT DEFAULT 'FREE';
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "subscriptionStart" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "subscriptionEnd" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "isTrialUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

ALTER TABLE "Business" DROP COLUMN IF EXISTS "businessType";
ALTER TABLE "Business" DROP COLUMN IF EXISTS "contactPerson";

-- Service types catalog + junction
CREATE TABLE "ServiceType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "status" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ServiceType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceType_slug_key" ON "ServiceType"("slug");

CREATE TABLE "BusinessServiceType" (
    "businessId" TEXT NOT NULL,
    "serviceTypeId" INTEGER NOT NULL,

    CONSTRAINT "BusinessServiceType_pkey" PRIMARY KEY ("businessId","serviceTypeId")
);

ALTER TABLE "BusinessServiceType" ADD CONSTRAINT "BusinessServiceType_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessServiceType" ADD CONSTRAINT "BusinessServiceType_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Business" ADD CONSTRAINT "Business_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default service types
INSERT INTO "ServiceType" ("name", "slug", "icon", "status") VALUES
  ('Wedding', 'wedding', '💍', 1),
  ('Corporate', 'corporate', '🏢', 1),
  ('Birthday', 'birthday', '🎂', 1),
  ('Festival', 'festival', '🎉', 1)
ON CONFLICT ("slug") DO NOTHING;

SELECT setval(pg_get_serial_sequence('"ServiceType"', 'id'), (SELECT COALESCE(MAX("id"), 1) FROM "ServiceType"));
