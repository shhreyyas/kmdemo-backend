/*
  Warnings:

  - Made the column `businessName` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `licenseCode` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "address" TEXT,
ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "contactNumber" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "gstNumber" TEXT,
ADD COLUMN     "isProfileCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "yearsExperience" INTEGER;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "businessName" SET NOT NULL,
ALTER COLUMN "licenseCode" SET NOT NULL;
