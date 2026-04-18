-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED');

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "status" "QuotationStatus" NOT NULL DEFAULT 'SENT';
