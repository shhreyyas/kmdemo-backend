-- DropForeignKey
ALTER TABLE "MenuItem" DROP CONSTRAINT "MenuItem_createdByUserId_fkey";

-- AlterTable
ALTER TABLE "MenuItem" ALTER COLUMN "businessId" DROP NOT NULL,
ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "MenuItem_isGlobal_idx" ON "MenuItem"("isGlobal");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
