/*
  Warnings:

  - You are about to drop the column `nameSnapshotEn` on the `BookingEventRequiredItem` table. All the data in the column will be lost.
  - You are about to drop the column `nameSnapshotGu` on the `BookingEventRequiredItem` table. All the data in the column will be lost.
  - You are about to drop the column `nameSnapshotHi` on the `BookingEventRequiredItem` table. All the data in the column will be lost.
  - You are about to drop the column `nameSnapshotEn` on the `BookingRequiredItem` table. All the data in the column will be lost.
  - You are about to drop the column `nameSnapshotGu` on the `BookingRequiredItem` table. All the data in the column will be lost.
  - You are about to drop the column `nameSnapshotHi` on the `BookingRequiredItem` table. All the data in the column will be lost.
  - You are about to drop the column `nameEn` on the `RequiredItem` table. All the data in the column will be lost.
  - You are about to drop the column `nameGu` on the `RequiredItem` table. All the data in the column will be lost.
  - You are about to drop the column `nameHi` on the `RequiredItem` table. All the data in the column will be lost.
  - Added the required column `nameSnapshot` to the `BookingEventRequiredItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nameSnapshot` to the `BookingRequiredItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `RequiredItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BookingEventRequiredItem" DROP COLUMN "nameSnapshotEn",
DROP COLUMN "nameSnapshotGu",
DROP COLUMN "nameSnapshotHi",
ADD COLUMN     "nameSnapshot" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "BookingRequiredItem" DROP COLUMN "nameSnapshotEn",
DROP COLUMN "nameSnapshotGu",
DROP COLUMN "nameSnapshotHi",
ADD COLUMN     "nameSnapshot" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "RequiredItem" DROP COLUMN "nameEn",
DROP COLUMN "nameGu",
DROP COLUMN "nameHi",
ADD COLUMN     "name" JSONB NOT NULL;
