-- DropTable
DROP TABLE IF EXISTS "LicenseCode";

-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "licenseCode",
DROP COLUMN IF EXISTS "businessName";
