/*
  Warnings:

  - Made the column `businessId` on table `MenuItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `createdByUserId` on table `MenuItem` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "MenuItem" DROP CONSTRAINT "MenuItem_createdByUserId_fkey";

-- DropIndex
DROP INDEX "MenuItem_isGlobal_idx";

-- AlterTable
ALTER TABLE "MenuItem" ALTER COLUMN "businessId" SET NOT NULL,
ALTER COLUMN "createdByUserId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "MenuItem_parentMenuId_idx" ON "MenuItem"("parentMenuId");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
