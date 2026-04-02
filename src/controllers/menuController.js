const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const { successResponse, errorResponse } = require("../utils/response");

const FOOD_TYPES = new Set(["veg", "non_veg"]);

/**
 * Stored as `isGlobal` on the row:
 * - `false` only when both business and creator are set → private user item.
 * - `true` otherwise (catalog / bulk import without creator / missing business or user).
 */
function deriveIsGlobal(businessId, createdByUserId) {
  if (businessId == null || businessId === "") return true;
  if (createdByUserId == null || createdByUserId === "") return true;
  return false;
}

/** List/detail visibility: own rows always; else business must match when set; unscoped rows use isGlobal / creator rules. */
function canViewMenuItem(menu, contextBusinessId, userId) {
  if (menu.createdByUserId === userId) {
    return true;
  }
  if (menu.businessId != null && menu.businessId !== contextBusinessId) {
    return false;
  }
  if (menu.businessId == null) {
    return menu.isGlobal === true;
  }
  const dg = deriveIsGlobal(menu.businessId, menu.createdByUserId);
  return dg;
}

function normalizeIngredients(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  return raw;
}

/**
 * Row IDs where at least one ingredient object has a matching `name` (case-insensitive substring).
 */
async function findIdsMatchingIngredientNames(searchTerm, orBranches) {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT m.id
    FROM "MenuItem" m,
    LATERAL jsonb_array_elements(COALESCE(m."ingredients"::jsonb, '[]'::jsonb)) AS elem
    WHERE (elem->>'name') IS NOT NULL
      AND POSITION(LOWER(${searchTerm}) IN LOWER(elem->>'name')) > 0
  `;
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const visible = await prisma.menuItem.findMany({
    where: {
      AND: [{ OR: orBranches }, { id: { in: ids } }],
    },
    select: { id: true },
  });
  return visible.map((r) => r.id);
}

function sumIngredientCosts(ingredients) {
  let sum = 0;
  for (const i of ingredients) {
    const c = i?.cost;
    const n = typeof c === "number" ? c : Number(c);
    sum += Number.isFinite(n) ? n : 0;
  }
  return sum;
}

function formatMenuItem(row, { includeFinancials = true } = {}) {
  const ingredients = normalizeIngredients(row.ingredients);
  const price = Number(row.pricePerPerson);
  const estimated_cost = sumIngredientCosts(ingredients);
  const profit = price - estimated_cost;
  const profit_margin = price === 0 ? 0 : (profit / price) * 100;

  const base = {
    _id: row.id,
    name: row.name,
    description: row.description ?? null,
    price_per_person: price,
    category: row.category,
    food_type: row.foodType,
    business_id: row.businessId,
    created_by: row.createdByUserId,
    is_global: deriveIsGlobal(row.businessId, row.createdByUserId),
    parent_menu_id: row.parentMenuId,
    ingredients,
    image_url: row.imageUrl ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };

  if (includeFinancials) {
    base.estimated_cost = estimated_cost;
    base.profit = profit;
    base.profit_margin = profit_margin;
  }

  return base;
}

exports.createMenuItem = async (req, res) => {
  try {
    const userId = req.user.userId;
    const businessId = req.businessId;

    const { name, price_per_person, category, food_type, ingredients, image_url, description } =
      req.body;

    if (
      Object.prototype.hasOwnProperty.call(req.body, "_id") ||
      Object.prototype.hasOwnProperty.call(req.body, "id")
    ) {
      return errorResponse(
        res,
        "Invalid request fields",
        422,
        "VALIDATION_ERROR",
        "Menu item id is auto-generated; do not send _id or id in the body.",
      );
    }

    if (
      !name ||
      typeof name !== "string" ||
      price_per_person === undefined ||
      category == null ||
      typeof category !== "string" ||
      !food_type ||
      typeof food_type !== "string"
    ) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "name, price_per_person, category, and food_type are required.",
      );
    }

    if (!FOOD_TYPES.has(food_type)) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "food_type must be veg or non_veg.",
      );
    }

    const price = Number(price_per_person);
    if (!Number.isFinite(price) || price < 0) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "price_per_person must be a non-negative number.",
      );
    }

    const ing = normalizeIngredients(ingredients);

    let resolvedImageUrl = null;
    if (image_url !== undefined && image_url !== null) {
      if (typeof image_url !== "string") {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "image_url must be a string URL or omitted.",
        );
      }
      const trimmed = image_url.trim();
      resolvedImageUrl = trimmed === "" ? null : trimmed;
    }

    let resolvedDescription = null;
    if (description !== undefined && description !== null) {
      if (typeof description !== "string") {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "description must be a string or omitted.",
        );
      }
      const trimmed = description.trim();
      if (trimmed.length > 5000) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "description must be 5000 characters or fewer.",
        );
      }
      resolvedDescription = trimmed === "" ? null : trimmed;
    }

    const created = await prisma.menuItem.create({
      data: {
        name: name.trim(),
        description: resolvedDescription,
        pricePerPerson: new Prisma.Decimal(String(price)),
        category: category.trim(),
        foodType: food_type,
        businessId,
        createdByUserId: userId,
        isGlobal: deriveIsGlobal(businessId, userId),
        parentMenuId: null,
        ingredients: ing,
        imageUrl: resolvedImageUrl,
      },
    });

    return successResponse(
      res,
      "Menu item created successfully",
      formatMenuItem(created, { includeFinancials: false }),
      201,
    );
  } catch (error) {
    console.error("createMenuItem error:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};

exports.listMenuItems = async (req, res) => {
  try {
    const userId = req.user.userId;
    const businessId = req.businessId;

    const { category, food_type, search, q } = req.query;

    const visibilityOr = [{ isGlobal: true }, { createdByUserId: userId }];

    const orBranches = [
      {
        businessId,
        OR: visibilityOr,
      },
      {
        businessId: null,
        OR: [{ createdByUserId: userId }, { isGlobal: true }],
      },
      { createdByUserId: userId },
    ];

    const searchTerm = String(search ?? q ?? "").trim();
    if (searchTerm !== "") {
      if (searchTerm.length > 200) {
        return errorResponse(
          res,
          "Invalid query parameters",
          422,
          "VALIDATION_ERROR",
          "search must be 200 characters or fewer.",
        );
      }
    }

    if (food_type != null && String(food_type).trim() !== "") {
      if (!FOOD_TYPES.has(String(food_type).trim())) {
        return errorResponse(
          res,
          "Invalid query parameters",
          422,
          "VALIDATION_ERROR",
          "food_type filter must be veg or non_veg.",
        );
      }
    }

    const pageRaw = req.query.page ?? req.query.current_page;
    const perPageRaw = req.query.per_page;
    let page = parseInt(String(pageRaw ?? "1"), 10);
    let perPage = parseInt(String(perPageRaw ?? "10"), 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!Number.isFinite(perPage) || perPage < 1) perPage = 10;
    if (perPage > 100) perPage = 100;

    const skip = (page - 1) * perPage;

    const categoryTrim =
      category != null && String(category).trim() !== ""
        ? String(category).trim()
        : null;
    const foodTypeTrim =
      food_type != null && String(food_type).trim() !== ""
        ? String(food_type).trim()
        : null;

    const filterAnd = [];
    if (categoryTrim != null) {
      filterAnd.push({ category: categoryTrim });
    }
    if (foodTypeTrim != null) {
      filterAnd.push({ foodType: foodTypeTrim });
    }
    if (searchTerm !== "") {
      // Search only: dish name, or any ingredient’s `name` inside ingredients[].
      const searchOr = [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { description: { contains: searchTerm, mode: "insensitive" } },
      ];

      const ingredientNameIds = await findIdsMatchingIngredientNames(
        searchTerm,
        orBranches,
      );
      if (ingredientNameIds.length > 0) {
        searchOr.push({ id: { in: ingredientNameIds } });
      }

      filterAnd.push({ OR: searchOr });
    }

    const where =
      filterAnd.length > 0
        ? { AND: [{ OR: orBranches }, ...filterAnd] }
        : { OR: orBranches };

    const totalRecord = await prisma.menuItem.count({ where });

    const lastPage =
      totalRecord === 0 ? 0 : Math.ceil(totalRecord / perPage);
    const from = totalRecord === 0 ? 0 : skip + 1;
    const to = totalRecord === 0 ? 0 : Math.min(skip + perPage, totalRecord);

    const rows = await prisma.menuItem.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      skip,
      take: perPage,
    });

    const data = rows.map((row) =>
      formatMenuItem(row, { includeFinancials: true }),
    );

    return successResponse(res, "Menu items fetched successfully", data, 200, {
      pagination: {
        current_page: page,
        per_page: perPage,
        total_record: totalRecord,
        last_page: lastPage,
        from,
        to,
      },
    });
  } catch (error) {
    console.error("listMenuItems error:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};

exports.getMenuItem = async (req, res) => {
  try {
    const userId = req.user.userId;
    const businessId = req.businessId;
    const { id } = req.params;

    const menu = await prisma.menuItem.findUnique({
      where: { id },
    });

    if (!menu) {
      return errorResponse(
        res,
        "Menu item not found",
        404,
        "NOT_FOUND",
        "Menu item does not exist",
      );
    }

    if (!canViewMenuItem(menu, businessId, userId)) {
      return errorResponse(
        res,
        "Menu item not found",
        404,
        "NOT_FOUND",
        "Menu item does not exist",
      );
    }

    return successResponse(
      res,
      "Menu item fetched successfully",
      formatMenuItem(menu, { includeFinancials: true }),
      200,
    );
  } catch (error) {
    console.error("getMenuItem error:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};

exports.updateMenuItem = async (req, res) => {
  try {
    const userId = req.user.userId;
    const businessId = req.businessId;
    const { id } = req.params;

    const menu = await prisma.menuItem.findUnique({
      where: { id },
    });

    if (!menu) {
      return errorResponse(
        res,
        "Menu item not found",
        404,
        "NOT_FOUND",
        "Menu item does not exist",
      );
    }

    if (!canViewMenuItem(menu, businessId, userId)) {
      return errorResponse(
        res,
        "You do not have permission to update this item.",
        403,
        "FORBIDDEN",
        "This item is not visible in your current business context.",
      );
    }

    const dgMenu = deriveIsGlobal(menu.businessId, menu.createdByUserId);
    if (!dgMenu && menu.createdByUserId != null && menu.createdByUserId !== userId) {
      return errorResponse(
        res,
        "You do not have permission to update this item.",
        403,
        "FORBIDDEN",
        "This item belongs to another user.",
      );
    }

    const { name, price_per_person, category, food_type, ingredients, image_url, description } =
      req.body;
    const updates = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "name must be a non-empty string.",
        );
      }
      updates.name = name.trim();
    }
    if (price_per_person !== undefined) {
      const price = Number(price_per_person);
      if (!Number.isFinite(price) || price < 0) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "price_per_person must be a non-negative number.",
        );
      }
      updates.pricePerPerson = new Prisma.Decimal(String(price));
    }
    if (category !== undefined) {
      if (typeof category !== "string" || !category.trim()) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "category must be a non-empty string.",
        );
      }
      updates.category = category.trim();
    }
    if (food_type !== undefined) {
      if (!FOOD_TYPES.has(food_type)) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "food_type must be veg or non_veg.",
        );
      }
      updates.foodType = food_type;
    }
    if (ingredients !== undefined) {
      if (!Array.isArray(ingredients)) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "ingredients must be an array.",
        );
      }
      updates.ingredients = ingredients;
    }
    if (image_url !== undefined) {
      if (image_url !== null && typeof image_url !== "string") {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "image_url must be a string URL, null, or omitted.",
        );
      }
      if (image_url === null) {
        updates.imageUrl = null;
      } else {
        const trimmed = image_url.trim();
        updates.imageUrl = trimmed === "" ? null : trimmed;
      }
    }
    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "description must be a string, null, or omitted.",
        );
      }
      if (description === null) {
        updates.description = null;
      } else {
        const trimmed = description.trim();
        if (trimmed.length > 5000) {
          return errorResponse(
            res,
            "Missing or invalid request fields",
            422,
            "VALIDATION_ERROR",
            "description must be 5000 characters or fewer.",
          );
        }
        updates.description = trimmed === "" ? null : trimmed;
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "Provide at least one field to update.",
      );
    }

    if (deriveIsGlobal(menu.businessId, menu.createdByUserId)) {
      const newItem = await prisma.menuItem.create({
        data: {
          name: updates.name ?? menu.name,
          description:
            updates.description !== undefined ? updates.description : menu.description ?? null,
          pricePerPerson:
            updates.pricePerPerson ??
            menu.pricePerPerson,
          category: updates.category ?? menu.category,
          foodType: updates.foodType ?? menu.foodType,
          businessId,
          createdByUserId: userId,
          isGlobal: deriveIsGlobal(businessId, userId),
          parentMenuId: menu.id,
          ingredients: updates.ingredients ?? normalizeIngredients(menu.ingredients),
          imageUrl:
            updates.imageUrl !== undefined ? updates.imageUrl : menu.imageUrl ?? null,
        },
      });

      return successResponse(
        res,
        "Menu item updated successfully",
        formatMenuItem(newItem, { includeFinancials: false }),
        201,
      );
    }

    const updated = await prisma.menuItem.update({
      where: { id: menu.id },
      data: updates,
    });

    return successResponse(
      res,
      "Menu item updated successfully",
      formatMenuItem(updated, { includeFinancials: false }),
      200,
    );
  } catch (error) {
    console.error("updateMenuItem error:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};

exports.deleteMenuItem = async (req, res) => {
  try {
    const userId = req.user.userId;
    const businessId = req.businessId;
    const { id } = req.params;

    const menu = await prisma.menuItem.findUnique({
      where: { id },
    });

    if (!menu) {
      return errorResponse(
        res,
        "Menu item not found",
        404,
        "NOT_FOUND",
        "Menu item does not exist",
      );
    }

    if (!canViewMenuItem(menu, businessId, userId)) {
      return errorResponse(
        res,
        "You do not have permission to delete this item.",
        403,
        "FORBIDDEN",
        "This item is not visible in your current business context.",
      );
    }

    const dgDel = deriveIsGlobal(menu.businessId, menu.createdByUserId);
    if (dgDel && menu.createdByUserId != null) {
      return errorResponse(
        res,
        "You do not have permission to delete this item.",
        403,
        "FORBIDDEN",
        "Global items are admin-managed and cannot be deleted via this endpoint.",
      );
    }

    if (!dgDel && menu.createdByUserId !== userId) {
      return errorResponse(
        res,
        "You do not have permission to delete this item.",
        403,
        "FORBIDDEN",
        "This item belongs to another user.",
      );
    }

    await prisma.menuItem.delete({
      where: { id: menu.id },
    });

    return successResponse(res, "Menu item deleted successfully", null, 200);
  } catch (error) {
    console.error("deleteMenuItem error:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};
