-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "defaultServiceChargePct" DECIMAL(5,2) NOT NULL DEFAULT 10;
ALTER TABLE "Business" ADD COLUMN "defaultTaxPct" DECIMAL(5,2) NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'DRAFT',
    "stepNumber" INTEGER NOT NULL DEFAULT 1,
    "bookingCode" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "eventAt" TIMESTAMP(3),
    "eventLocation" TEXT,
    "functionType" TEXT,
    "guestCount" INTEGER,
    "notes" TEXT,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "serviceChargePct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "taxPct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "serviceChargeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingMenuItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "pricePerPlateSnapshot" DECIMAL(12,2) NOT NULL,
    "nameSnapshot" TEXT,
    "imageUrlSnapshot" TEXT,

    CONSTRAINT "BookingMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "serviceChargePct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "taxPct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "serviceChargeAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationMenuItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "pricePerPlateSnapshot" DECIMAL(12,2) NOT NULL,
    "nameSnapshot" TEXT,

    CONSTRAINT "QuotationMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_businessId_bookingCode_key" ON "Booking"("businessId", "bookingCode");

-- CreateIndex
CREATE INDEX "Booking_businessId_status_idx" ON "Booking"("businessId", "status");

-- CreateIndex
CREATE INDEX "Booking_businessId_eventAt_idx" ON "Booking"("businessId", "eventAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingMenuItem_bookingId_menuItemId_key" ON "BookingMenuItem"("bookingId", "menuItemId");

-- CreateIndex
CREATE INDEX "BookingMenuItem_bookingId_idx" ON "BookingMenuItem"("bookingId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_bookingId_idx" ON "PaymentTransaction"("bookingId");

-- CreateIndex
CREATE INDEX "Quotation_businessId_idx" ON "Quotation"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationMenuItem_quotationId_menuItemId_key" ON "QuotationMenuItem"("quotationId", "menuItemId");

-- CreateIndex
CREATE INDEX "QuotationMenuItem_quotationId_idx" ON "QuotationMenuItem"("quotationId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingMenuItem" ADD CONSTRAINT "BookingMenuItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingMenuItem" ADD CONSTRAINT "BookingMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuotationMenuItem" ADD CONSTRAINT "QuotationMenuItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuotationMenuItem" ADD CONSTRAINT "QuotationMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
