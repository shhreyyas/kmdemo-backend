const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");

function slugify(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "category";
}

async function ensureUniqueSlug(base, excludeId) {
  const root = slugify(base);
  for (let n = 0; n < 10000; n += 1) {
    const candidate = n === 0 ? root : `${root}-${n}`;
    const existing = await prisma.menuCategory.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (!existing) return candidate;
  }
  return `${root}-${Date.now()}`;
}

function formatCategory(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sort_order: row.sortOrder,
    is_active: row.isActive,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Public list for the app: active categories only, ordered. */
exports.getCategory = async (req, res) => {
  try {
    const rows = await prisma.menuCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return successResponse(
      res,
      "Categories fetched successfully",
      { categories: rows.map(formatCategory) },
      200,
    );
  } catch (error) {
    console.error("getCategory error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, slug, sort_order, is_active } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return errorResponse(res, "name is required", 200, "VALIDATION_ERROR");
    }

    const finalSlug = await ensureUniqueSlug(slug != null && slug !== "" ? slug : name);

    const row = await prisma.menuCategory.create({
      data: {
        name: name.trim(),
        slug: finalSlug,
        sortOrder:
          sort_order !== undefined && Number.isFinite(Number(sort_order))
            ? Math.trunc(Number(sort_order))
            : 0,
        isActive: typeof is_active === "boolean" ? is_active : true,
      },
    });

    return successResponse(res, "Category created successfully", formatCategory(row), 200);
  } catch (error) {
    console.error("createCategory error:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Category name or slug already exists", 200, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, sort_order, is_active } = req.body;

    const existing = await prisma.menuCategory.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Category not found", 404, "NOT_FOUND");
    }

    const data = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return errorResponse(res, "name must be a non-empty string", 200, "VALIDATION_ERROR");
      }
      data.name = name.trim();
    }
    if (slug !== undefined) {
      const nextSlug =
        slug != null && String(slug).trim() !== ""
          ? await ensureUniqueSlug(slug, id)
          : await ensureUniqueSlug(data.name ?? existing.name, id);
      data.slug = nextSlug;
    }
    if (sort_order !== undefined) {
      if (!Number.isFinite(Number(sort_order))) {
        return errorResponse(res, "sort_order must be a number", 200, "VALIDATION_ERROR");
      }
      data.sortOrder = Math.trunc(Number(sort_order));
    }
    if (is_active !== undefined) {
      if (typeof is_active !== "boolean") {
        return errorResponse(res, "is_active must be a boolean", 200, "VALIDATION_ERROR");
      }
      data.isActive = is_active;
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(res, "No fields to update", 200, "VALIDATION_ERROR");
    }

    const row = await prisma.menuCategory.update({
      where: { id },
      data,
    });

    return successResponse(res, "Category updated successfully", formatCategory(row), 200);
  } catch (error) {
    console.error("updateCategory error:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Category name or slug already exists", 200, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.menuCategory.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Category not found", 404, "NOT_FOUND");
    }

    await prisma.menuCategory.delete({ where: { id } });

    return successResponse(res, "Category deleted successfully", { id }, 200);
  } catch (error) {
    console.error("deleteCategory error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
