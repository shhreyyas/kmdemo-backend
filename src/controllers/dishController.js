const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const { successResponse, errorResponse } = require("../utils/response");

function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function serializeDish(dish) {
  return {
    id: dish.id,
    business_id: dish.businessId,
    name: dish.name,
    price_per_plate: num(dish.pricePerPlate),
    is_template: dish.isTemplate,
    parent_dish_id: dish.parentDishId,
    menu_items: (dish.menuItems || []).map((row) => ({
      id: row.id,
      menu_item_id: row.menuItemId,
      quantity: row.quantity ?? 1,
      menu_item: row.menuItem
        ? {
            id: row.menuItem.id,
            name: row.menuItem.name,
            price_per_person: num(row.menuItem.pricePerPerson),
            category: row.menuItem.category,
            image_url: row.menuItem.imageUrl ?? null,
          }
        : undefined,
    })),
    created_at: dish.createdAt?.toISOString?.() ?? dish.createdAt,
    updated_at: dish.updatedAt?.toISOString?.() ?? dish.updatedAt,
  };
}

async function listDishes(req, res) {
  try {
    const businessId = req.businessId;
    const rows = await prisma.dish.findMany({
      where: { businessId, isTemplate: true },
      orderBy: { updatedAt: "desc" },
      include: {
        menuItems: {
          include: { menuItem: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return successResponse(res, "OK", rows.map(serializeDish));
  } catch (e) {
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function getDish(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const row = await prisma.dish.findFirst({
      where: { id, businessId },
      include: {
        menuItems: {
          include: { menuItem: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!row) return errorResponse(res, "Dish not found", 404, "NOT_FOUND");
    return successResponse(res, "OK", serializeDish(row));
  } catch (e) {
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function createDish(req, res) {
  try {
    const businessId = req.businessId;
    const body = req.body || {};
    const name = String(body.name ?? "").trim();
    if (!name) return errorResponse(res, "Dish name required", 422, "VALIDATION_ERROR");
    const menuItems = Array.isArray(body.menu_items) ? body.menu_items : [];
    if (menuItems.length === 0) {
      return errorResponse(res, "Select at least one menu item", 422, "VALIDATION_ERROR");
    }
    const normalized = menuItems
      .map((row) => ({
        menuItemId: String(row.menu_item_id ?? row.menuItemId ?? "").trim(),
        quantity: Math.max(1, parseInt(String(row.quantity ?? 1), 10) || 1),
      }))
      .filter((row) => row.menuItemId);
    const ids = [...new Set(normalized.map((row) => row.menuItemId))];
    const existingMenus = await prisma.menuItem.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existingMenus.length !== ids.length) {
      return errorResponse(res, "Invalid menu item in dish", 422, "VALIDATION_ERROR");
    }
    const dish = await prisma.$transaction(async (tx) => {
      const created = await tx.dish.create({
        data: {
          businessId,
          name,
          pricePerPlate: new Prisma.Decimal(String(num(body.price_per_plate ?? 0))),
          isTemplate: body.is_template !== false,
          parentDishId: body.parent_dish_id ? String(body.parent_dish_id) : null,
        },
      });
      await tx.dishMenuItem.createMany({
        data: normalized.map((row) => ({
          dishId: created.id,
          menuItemId: row.menuItemId,
          quantity: row.quantity,
        })),
      });
      return tx.dish.findUnique({
        where: { id: created.id },
        include: { menuItems: { include: { menuItem: true }, orderBy: { createdAt: "asc" } } },
      });
    });
    return successResponse(res, "Dish created", serializeDish(dish));
  } catch (e) {
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function updateDish(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const body = req.body || {};
    const existing = await prisma.dish.findFirst({ where: { id, businessId } });
    if (!existing) return errorResponse(res, "Dish not found", 404, "NOT_FOUND");
    const name =
      body.name !== undefined ? String(body.name ?? "").trim() : existing.name;
    if (!name) return errorResponse(res, "Dish name required", 422, "VALIDATION_ERROR");
    const menuItems = Array.isArray(body.menu_items) ? body.menu_items : null;
    await prisma.$transaction(async (tx) => {
      await tx.dish.update({
        where: { id },
        data: {
          name,
          pricePerPlate:
            body.price_per_plate !== undefined
              ? new Prisma.Decimal(String(num(body.price_per_plate)))
              : existing.pricePerPlate,
        },
      });
      if (menuItems) {
        const normalized = menuItems
          .map((row) => ({
            menuItemId: String(row.menu_item_id ?? row.menuItemId ?? "").trim(),
            quantity: Math.max(1, parseInt(String(row.quantity ?? 1), 10) || 1),
          }))
          .filter((row) => row.menuItemId);
        await tx.dishMenuItem.deleteMany({ where: { dishId: id } });
        if (normalized.length) {
          await tx.dishMenuItem.createMany({
            data: normalized.map((row) => ({
              dishId: id,
              menuItemId: row.menuItemId,
              quantity: row.quantity,
            })),
          });
        }
      }
    });
    const updated = await prisma.dish.findUnique({
      where: { id },
      include: {
        menuItems: { include: { menuItem: true }, orderBy: { createdAt: "asc" } },
      },
    });
    return successResponse(res, "Dish updated", serializeDish(updated));
  } catch (e) {
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function deleteDish(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const existing = await prisma.dish.findFirst({ where: { id, businessId } });
    if (!existing) return errorResponse(res, "Dish not found", 404, "NOT_FOUND");
    await prisma.dish.delete({ where: { id } });
    return successResponse(res, "Dish deleted", { id });
  } catch (e) {
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

module.exports = {
  listDishes,
  getDish,
  createDish,
  updateDish,
  deleteDish,
};

