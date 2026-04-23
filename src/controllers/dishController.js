const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const { successResponse, errorResponse } = require("../utils/response");

function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseIngredients(ingredients) {
  if (Array.isArray(ingredients)) return ingredients;
  if (typeof ingredients === "string") {
    try {
      const parsed = JSON.parse(ingredients);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildDishHowToMake(menuItems) {
  return (menuItems || [])
    .map((row) => {
      const howToMake = String(row.menuItem?.howToMake ?? "").trim();
      if (!howToMake) return null;
      return {
        menu_item_id: row.menuItem.id,
        menu_item_name: row.menuItem.name,
        instructions: howToMake,
      };
    })
    .filter(Boolean);
}

function buildTotalRequiredIngredients(menuItems) {
  const buckets = new Map();
  for (const row of menuItems || []) {
    const multiplier = Math.max(1, parseInt(String(row.quantity ?? 1), 10) || 1);
    const ingredients = parseIngredients(row.menuItem?.ingredients);
    for (const ing of ingredients) {
      const ingredientName = String(ing?.name ?? "").trim();
      if (!ingredientName) continue;
      const unit = String(ing?.unit ?? "").trim();
      const qty = num(ing?.qty);
      if (qty <= 0) continue;
      const totalQty = qty * multiplier;
      const key = `${ingredientName.toLowerCase()}::${unit.toLowerCase()}`;
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          ingredient_name: ingredientName,
          unit,
          total_quantity: totalQty,
        });
      } else {
        existing.total_quantity = num(existing.total_quantity) + totalQty;
      }
    }
  }
  return Array.from(buckets.values()).sort((a, b) =>
    String(a.ingredient_name).localeCompare(String(b.ingredient_name)),
  );
}

function serializeDish(dish, options = {}) {
  const includeComputed = options.includeComputed === true;
  const howToMake = includeComputed ? buildDishHowToMake(dish.menuItems || []) : undefined;
  const totalRequiredIngredients = includeComputed
    ? buildTotalRequiredIngredients(dish.menuItems || [])
    : undefined;
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
            how_to_make: row.menuItem.howToMake ?? null,
          }
        : undefined,
    })),
    ...(includeComputed
      ? {
          how_to_make: howToMake,
          total_required_ingredients: totalRequiredIngredients,
        }
      : {}),
    created_at: dish.createdAt?.toISOString?.() ?? dish.createdAt,
    updated_at: dish.updatedAt?.toISOString?.() ?? dish.updatedAt,
  };
}

async function listDishes(req, res) {
  try {
    const businessId = req.businessId;
    const q = String(req.query?.q ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query?.page ?? "1"), 10) || 1);
    const perPage = Math.min(
      50,
      Math.max(1, parseInt(String(req.query?.per_page ?? "10"), 10) || 10),
    );
    const where = {
      businessId,
      isTemplate: true,
      ...(q
        ? {
            name: {
              contains: q,
              mode: "insensitive",
            },
          }
        : {}),
    };
    const skip = (page - 1) * perPage;
    const [rows, total] = await Promise.all([
      prisma.dish.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: perPage,
        include: {
          menuItems: {
            include: { menuItem: true },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.dish.count({ where }),
    ]);
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    return successResponse(res, "OK", {
      items: rows.map(serializeDish),
      pagination: {
        total,
        page,
        per_page: perPage,
        last_page: lastPage,
      },
    });
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
    return successResponse(res, "OK", serializeDish(row, { includeComputed: true }));
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

