-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('CHEF', 'HELPER', 'WAITER', 'MANAGER', 'CLEANER', 'VIP_SERVICE_BOY', 'COUNTER_STAFF', 'DECORATION_STAFF');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('AVAILABLE', 'BUSY', 'ON_LEAVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ExtraServicePricingType" AS ENUM ('FIXED', 'PER_UNIT', 'PER_GUEST');

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "StaffRole" NOT NULL,
    "dailyCharge" DECIMAL(12,2),
    "status" "StaffStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventStaff" (
    "id" TEXT NOT NULL,
    "bookingEventId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "assignedByUserId" TEXT,
    "allowConflict" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraService" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "pricingType" "ExtraServicePricingType" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtraService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingExtraServiceLine" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "extraServiceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "pricingTypeSnapshot" "ExtraServicePricingType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingExtraServiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Staff_businessId_role_isActive_idx" ON "Staff"("businessId", "role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EventStaff_bookingEventId_staffId_key" ON "EventStaff"("bookingEventId", "staffId");

-- CreateIndex
CREATE INDEX "EventStaff_staffId_idx" ON "EventStaff"("staffId");

-- CreateIndex
CREATE INDEX "EventStaff_bookingEventId_idx" ON "EventStaff"("bookingEventId");

-- CreateIndex
CREATE INDEX "ExtraService_businessId_isActive_idx" ON "ExtraService"("businessId", "isActive");

-- CreateIndex
CREATE INDEX "BookingExtraServiceLine_bookingId_idx" ON "BookingExtraServiceLine"("bookingId");

-- CreateIndex
CREATE INDEX "BookingExtraServiceLine_extraServiceId_idx" ON "BookingExtraServiceLine"("extraServiceId");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaff" ADD CONSTRAINT "EventStaff_bookingEventId_fkey" FOREIGN KEY ("bookingEventId") REFERENCES "BookingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaff" ADD CONSTRAINT "EventStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraService" ADD CONSTRAINT "ExtraService_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingExtraServiceLine" ADD CONSTRAINT "BookingExtraServiceLine_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingExtraServiceLine" ADD CONSTRAINT "BookingExtraServiceLine_extraServiceId_fkey" FOREIGN KEY ("extraServiceId") REFERENCES "ExtraService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
