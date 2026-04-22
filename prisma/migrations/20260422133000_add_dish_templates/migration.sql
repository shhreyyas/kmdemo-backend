CREATE TABLE "Dish" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "pricePerPlate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "isTemplate" BOOLEAN NOT NULL DEFAULT true,
  "parentDishId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DishMenuItem" (
  "id" TEXT NOT NULL,
  "dishId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DishMenuItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DishMenuItem_dishId_menuItemId_key" ON "DishMenuItem"("dishId", "menuItemId");
CREATE INDEX "Dish_businessId_idx" ON "Dish"("businessId");
CREATE INDEX "Dish_parentDishId_idx" ON "Dish"("parentDishId");
CREATE INDEX "DishMenuItem_dishId_idx" ON "DishMenuItem"("dishId");

ALTER TABLE "Dish"
ADD CONSTRAINT "Dish_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Dish"
ADD CONSTRAINT "Dish_parentDishId_fkey"
FOREIGN KEY ("parentDishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DishMenuItem"
ADD CONSTRAINT "DishMenuItem_dishId_fkey"
FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DishMenuItem"
ADD CONSTRAINT "DishMenuItem_menuItemId_fkey"
FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
