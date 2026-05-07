const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { renderSupplyPdfBuffer } = require("../utils/renderSupplyPdfBuffer");
const {
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
} = require("../utils/localization");

const VALID_TYPES = new Set(["INGREDIENT", "UTENSIL"]);

/**
 * Same rule as MenuItem: private only when both business and creator are set.
 */
function deriveSupplyIsGlobal(businessId, createdByUserId) {
  if (businessId == null || businessId === "") return true;
  if (createdByUserId == null || createdByUserId === "") return true;
  return false;
}

/** List/select visibility mirrors menu listMenuItems OR-branches. */
function supplyVisibilityOrBranches(businessId, userId) {
  return [
    { businessId, OR: [{ isGlobal: true }, { createdByUserId: userId }] },
    { businessId: null, OR: [{ createdByUserId: userId }, { isGlobal: true }] },
    { createdByUserId: userId },
  ];
}

/** Utensil rows with `availableCount` cap booking quantities. */
function utensilStockExceededMessage(source, requestedQty) {
  if (source.type !== "UTENSIL" || source.availableCount == null) return null;
  const q = parseInt(String(requestedQty), 10);
  const qty = Number.isFinite(q) ? q : 0;
  if (qty > source.availableCount) {
    return "Quantity cannot exceed remaining stock for this utensil";
  }
  return null;
}

async function loadSupplyCategoryBySlug(slug) {
  return prisma.supplyItemCategory.findFirst({
    where: { slug, isActive: true },
    select: { slug: true, name: true },
  });
}

function serializeSupplyItem(row, lang) {
  const localized = normalizeLocalizedName(row.name) || { en: "" };
  return {
    id: row.id,
    business_id: row.businessId ?? null,
    is_global: row.isGlobal,
    type: row.type,
    category: row.category?.slug ?? row.categorySlug,
    name: resolveLocalizedName(row.name, lang),
    name_i18n: localized,
    unit_options: row.unitOptions ?? [],
    default_unit: row.defaultUnit,
    available_count: row.availableCount ?? null,
    photo_url: row.photoUrl ?? null,
    is_active: row.isActive,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function serializeSupplyItemCategory(row, lang) {
  const localized = normalizeLocalizedName(row.name) || { en: "" };
  return {
    id: row.id,
    slug: row.slug,
    name: resolveLocalizedName(row.name, lang),
    name_i18n: localized,
    sort_order: row.sortOrder,
    is_active: row.isActive,
  };
}

/**
 * GET query.type optional: INGREDIENT | UTENSIL — only categories that have
 * at least one visible supply item of that type (for tab UX).
 * Omit type to return every active row from SupplyItemCategory.
 */
async function listSupplyItemCategories(req, res) {
  try {
    const language = getRequestedLanguage(req);
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const typeRaw = req.query.type != null ? String(req.query.type).toUpperCase() : "";
    const type = VALID_TYPES.has(typeRaw) ? typeRaw : null;

    if (req.query.type != null && !type) {
      return errorResponse(res, "Invalid type", 200, "VALIDATION_ERROR");
    }

    if (type) {
      const supplyRows = await prisma.supplyItem.findMany({
        where: {
          AND: [
            { type },
            { isActive: true },
            { OR: supplyVisibilityOrBranches(businessId, userId) },
          ],
        },
        select: { categorySlug: true },
      });
      const slugSet = [...new Set(supplyRows.map((r) => r.categorySlug))];
      if (slugSet.length === 0) {
        return successResponse(res, "OK", { categories: [] });
      }
      const rows = await prisma.supplyItemCategory.findMany({
        where: { isActive: true, slug: { in: slugSet } },
        orderBy: { sortOrder: "asc" },
      });
      return successResponse(res, "OK", {
        categories: rows.map((row) => serializeSupplyItemCategory(row, language)),
      });
    }

    const rows = await prisma.supplyItemCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    return successResponse(res, "OK", {
      categories: rows.map((row) => serializeSupplyItemCategory(row, language)),
    });
  } catch (e) {
    console.error("listSupplyItemCategories:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function createSupplyItem(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const body = req.body || {};
    const type = String(body.type || "").toUpperCase();
    const categorySlug = String(body.category_slug ?? body.category ?? "")
      .trim()
      .toLowerCase();
    const names = normalizeLocalizedName(body.name ?? body.name_i18n);
    if (!VALID_TYPES.has(type)) {
      return errorResponse(res, "Invalid type", 200, "VALIDATION_ERROR");
    }
    if (!categorySlug) {
      return errorResponse(res, "category_slug is required", 200, "VALIDATION_ERROR");
    }
    if (!names) {
      return errorResponse(
        res,
        "All language names are required",
        200,
        "VALIDATION_ERROR",
      );
    }
    const categoryRow = await loadSupplyCategoryBySlug(categorySlug);
    if (!categoryRow) {
      return errorResponse(
        res,
        "category_slug must match an active supply category slug",
        200,
        "VALIDATION_ERROR",
      );
    }

    const row = await prisma.supplyItem.create({
      data: {
        businessId,
        createdByUserId: userId ?? null,
        isGlobal: deriveSupplyIsGlobal(businessId, userId),
        type,
        categorySlug: categoryRow.slug,
        name: names,
        unitOptions: Array.isArray(body.unit_options) ? body.unit_options : [],
        defaultUnit: String(body.default_unit || "pcs"),
        availableCount:
          body.available_count == null
            ? null
            : Math.max(0, parseInt(String(body.available_count), 10) || 0),
        photoUrl: body.photo_url ?? null,
      },
      include: { category: true },
    });
    return successResponse(
      res,
      "Supply item created",
      serializeSupplyItem(row, getRequestedLanguage(req)),
    );
  } catch (e) {
    console.error("createSupplyItem:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

function nameMatchesSearch(row, qLower) {
  const haystack = [
    resolveLocalizedName(row.name, "en"),
    resolveLocalizedName(row.name, "hi"),
    resolveLocalizedName(row.name, "gu"),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(qLower);
}

function buildPagination(page, limit, total, returnedCount) {
  const skip = (page - 1) * limit;
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    total_pages: totalPages,
    has_more: skip + returnedCount < total,
  };
}

async function listSupplyItems(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const language = getRequestedLanguage(req);
    const type = req.query.type ? String(req.query.type).toUpperCase() : undefined;
    const categorySlug = req.query.category_slug
      ? String(req.query.category_slug).trim().toLowerCase()
      : req.query.category
        ? String(req.query.category).trim().toLowerCase()
        : undefined;
    const q = String(req.query.q ?? "").trim();
    const qLower = q.toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const skip = (page - 1) * limit;

    const filterAnd = [{ isActive: true }];
    if (type && VALID_TYPES.has(type)) filterAnd.push({ type });
    if (categorySlug) filterAnd.push({ categorySlug });

    const visibilityWhere = {
      AND: [{ OR: supplyVisibilityOrBranches(businessId, userId) }, ...filterAnd],
    };

    if (!q) {
      const [total, rows] = await prisma.$transaction([
        prisma.supplyItem.count({ where: visibilityWhere }),
        prisma.supplyItem.findMany({
          where: visibilityWhere,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: { category: true },
        }),
      ]);
      return successResponse(res, "OK", {
        items: rows.map((row) => serializeSupplyItem(row, language)),
        pagination: buildPagination(page, limit, total, rows.length),
      });
    }

    /** Search: same locale matching as before; filter then paginate (scoped by category when set). */
    const allMatching = await prisma.supplyItem.findMany({
      where: visibilityWhere,
      orderBy: { createdAt: "desc" },
      include: { category: true },
    });
    const filteredRows = allMatching.filter((row) => nameMatchesSearch(row, qLower));
    const total = filteredRows.length;
    const pageRows = filteredRows.slice(skip, skip + limit);
    return successResponse(res, "OK", {
      items: pageRows.map((row) => serializeSupplyItem(row, language)),
      pagination: buildPagination(page, limit, total, pageRows.length),
    });
  } catch (e) {
    console.error("listSupplyItems:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function updateSupplyItem(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const body = req.body || {};
    const existing = await prisma.supplyItem.findFirst({
      where: { id, businessId, isActive: true },
      include: { category: true },
    });
    if (!existing) return errorResponse(res, "Supply item not found", 404, "NOT_FOUND");
    const hasNameInput = body.name !== undefined || body.name_i18n !== undefined;
    const names = hasNameInput
      ? normalizeLocalizedName(body.name ?? body.name_i18n)
      : null;
    if (hasNameInput && !names) {
      return errorResponse(
        res,
        "All language names are required",
        200,
        "VALIDATION_ERROR",
      );
    }
    const row = await prisma.supplyItem.update({
      where: { id },
      data: {
        ...(names ? { name: names } : {}),
        ...(Array.isArray(body.unit_options) ? { unitOptions: body.unit_options } : {}),
        ...(body.default_unit ? { defaultUnit: String(body.default_unit) } : {}),
        ...(body.available_count !== undefined
          ? {
              availableCount:
                body.available_count == null
                  ? null
                  : Math.max(0, Number(body.available_count) || 0),
            }
          : {}),
        ...(body.photo_url !== undefined ? { photoUrl: body.photo_url } : {}),
      },
      include: { category: true },
    });
    return successResponse(
      res,
      "Supply item updated",
      serializeSupplyItem(row, getRequestedLanguage(req)),
    );
  } catch (e) {
    console.error("updateSupplyItem:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function deleteSupplyItem(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const existing = await prisma.supplyItem.findFirst({
      where: { id, businessId, isActive: true },
      select: { id: true },
    });
    if (!existing) return errorResponse(res, "Supply item not found", 404, "NOT_FOUND");
    await prisma.supplyItem.update({ where: { id }, data: { isActive: false } });
    return successResponse(res, "Supply item deleted", { id });
  } catch (e) {
    console.error("deleteSupplyItem:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function setBookingSupplyItems(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const bookingId = req.params.id;
    const payload = Array.isArray(req.body?.items) ? req.body.items : [];
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true, status: true },
    });
    if (!booking) return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    if (booking.status === "CANCELLED") {
      return errorResponse(
        res,
        "Cancelled booking cannot be updated",
        200,
        "VALIDATION_ERROR",
      );
    }
    const ids = [
      ...new Set(
        payload
          .map((row) => String(row.supply_item_id || "").trim())
          .filter(Boolean),
      ),
    ];
    const supplyRows = await prisma.supplyItem.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        OR: supplyVisibilityOrBranches(businessId, userId),
      },
      include: { category: true },
    });
    const byId = new Map(supplyRows.map((row) => [row.id, row]));
    if (supplyRows.length !== ids.length) {
      return errorResponse(
        res,
        "One or more supply items not found",
        200,
        "VALIDATION_ERROR",
      );
    }

    for (const row of supplyRows) {
      if (row.businessId != null && row.businessId !== businessId) {
        return errorResponse(
          res,
          "One or more supply items not found",
          200,
          "VALIDATION_ERROR",
        );
      }
    }

    for (const row of payload) {
      const source = byId.get(String(row.supply_item_id || "").trim());
      if (!source) continue;
      const msg = utensilStockExceededMessage(source, row.quantity);
      if (msg) return errorResponse(res, msg, 200, "VALIDATION_ERROR");
    }

    await prisma.$transaction(async (tx) => {
      await tx.bookingSupplyItem.deleteMany({ where: { bookingId } });
      if (payload.length) {
        await tx.bookingSupplyItem.createMany({
          data: payload.map((row) => {
            const source = byId.get(String(row.supply_item_id));
            let qty = Math.max(
              1,
              Math.min(999, parseInt(String(row.quantity), 10) || 1),
            );
            if (
              source.type === "UTENSIL" &&
              source.availableCount != null &&
              qty > source.availableCount
            ) {
              qty = source.availableCount;
            }
            return {
              bookingId,
              supplyItemId: source.id,
              quantity: qty,
              unit: String(row.unit || source.defaultUnit || "pcs"),
              categorySlug: source.categorySlug,
              nameSnapshot: source.name,
            };
          }),
        });
      }
    });
    return successResponse(res, "Supply items updated", { ok: true });
  } catch (e) {
    console.error("setBookingSupplyItems:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function getBookingSupplyItems(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;
    const lang = getRequestedLanguage(req);
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true },
    });
    if (!booking) return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    const rows = await prisma.bookingSupplyItem.findMany({
      where: { bookingId },
      orderBy: { createdAt: "asc" },
    });
    return successResponse(res, "OK", {
      items: rows.map((row) => ({
        supply_item_id: row.supplyItemId,
        quantity: row.quantity,
        unit: row.unit,
        category: row.categorySlug,
        name: resolveLocalizedName(row.nameSnapshot, lang),
        name_i18n: normalizeLocalizedName(row.nameSnapshot) || { en: "" },
      })),
    });
  } catch (e) {
    console.error("getBookingSupplyItems:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function setEventSupplyItems(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const bookingId = req.params.id;
    const eventId = req.params.eventId;
    const body = req.body || {};
    const itemType = String(body.type || "INGREDIENT").toUpperCase();
    if (!VALID_TYPES.has(itemType)) {
      return errorResponse(res, "Invalid type", 200, "VALIDATION_ERROR");
    }
    const payload = Array.isArray(body.items) ? body.items : [];
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true, status: true },
    });
    if (!booking) return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    if (booking.status === "CANCELLED") {
      return errorResponse(
        res,
        "Cancelled booking cannot be updated",
        200,
        "VALIDATION_ERROR",
      );
    }
    const event = await prisma.bookingEvent.findFirst({
      where: { id: eventId, bookingId },
      select: { id: true },
    });
    if (!event) return errorResponse(res, "Event not found", 404, "NOT_FOUND");
    const ids = [
      ...new Set(
        payload
          .map((row) => String(row.supply_item_id || "").trim())
          .filter(Boolean),
      ),
    ];
    const supplyRows = await prisma.supplyItem.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        OR: supplyVisibilityOrBranches(businessId, userId),
      },
      include: { category: true },
    });
    const byId = new Map(supplyRows.map((row) => [row.id, row]));
    if (supplyRows.length !== ids.length) {
      return errorResponse(
        res,
        "One or more supply items not found",
        200,
        "VALIDATION_ERROR",
      );
    }

    for (const row of supplyRows) {
      if (row.businessId != null && row.businessId !== businessId) {
        return errorResponse(
          res,
          "One or more supply items not found",
          200,
          "VALIDATION_ERROR",
        );
      }
    }

    if (itemType === "UTENSIL") {
      for (const row of payload) {
        const source = byId.get(String(row.supply_item_id || "").trim());
        if (!source) continue;
        const msg = utensilStockExceededMessage(source, row.quantity);
        if (msg) return errorResponse(res, msg, 200, "VALIDATION_ERROR");
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.bookingEventSupplyItem.deleteMany({
        where: { bookingEventId: eventId, itemType },
      });
      if (payload.length) {
        await tx.bookingEventSupplyItem.createMany({
          data: payload.map((row) => {
            const source = byId.get(String(row.supply_item_id));
            let qty = Math.max(
              1,
              Math.min(999, parseInt(String(row.quantity), 10) || 1),
            );
            if (
              itemType === "UTENSIL" &&
              source.availableCount != null &&
              qty > source.availableCount
            ) {
              qty = source.availableCount;
            }
            return {
              bookingEventId: eventId,
              supplyItemId: source.id,
              itemType,
              quantity: qty,
              unit: String(row.unit || source.defaultUnit || "pcs"),
              categorySlug: source.categorySlug,
              nameSnapshot: source.name,
            };
          }),
        });
      }
    });
    return successResponse(res, "Event supply items updated", { ok: true });
  } catch (e) {
    console.error("setEventSupplyItems:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function getEventSupplyItems(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;
    const eventId = req.params.eventId;
    const lang = getRequestedLanguage(req);
    const itemType = req.query.type ? String(req.query.type).toUpperCase() : undefined;
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true },
    });
    if (!booking) return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    const rows = await prisma.bookingEventSupplyItem.findMany({
      where: {
        bookingEventId: eventId,
        ...(itemType && VALID_TYPES.has(itemType) ? { itemType } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    return successResponse(res, "OK", {
      items: rows.map((row) => ({
        supply_item_id: row.supplyItemId,
        quantity: row.quantity,
        unit: row.unit,
        category: row.categorySlug,
        type: row.itemType,
        name: resolveLocalizedName(row.nameSnapshot, lang),
        name_i18n: normalizeLocalizedName(row.nameSnapshot) || { en: "" },
      })),
    });
  } catch (e) {
    console.error("getEventSupplyItems:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function updateEventSupplyItem(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;
    const eventId = req.params.eventId;
    const supplyItemId = req.params.supplyItemId;
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true, status: true },
    });
    if (!booking) return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    if (booking.status === "CANCELLED") {
      return errorResponse(
        res,
        "Cancelled booking cannot be updated",
        200,
        "VALIDATION_ERROR",
      );
    }
    const row = await prisma.bookingEventSupplyItem.findFirst({
      where: { bookingEventId: eventId, supplyItemId },
    });
    if (!row) return errorResponse(res, "Supply item not found", 404, "NOT_FOUND");
    await prisma.bookingEventSupplyItem.update({
      where: { id: row.id },
      data: {
        ...(req.body?.quantity !== undefined
          ? {
              quantity: Math.max(
                1,
                Math.min(999, parseInt(String(req.body.quantity), 10) || 1),
              ),
            }
          : {}),
        ...(req.body?.unit !== undefined
          ? { unit: String(req.body.unit || row.unit) }
          : {}),
      },
    });
    return successResponse(res, "Event supply item updated", { ok: true });
  } catch (e) {
    console.error("updateEventSupplyItem:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function deleteEventSupplyItem(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;
    const eventId = req.params.eventId;
    const supplyItemId = req.params.supplyItemId;
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true, status: true },
    });
    if (!booking) return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    if (booking.status === "CANCELLED") {
      return errorResponse(
        res,
        "Cancelled booking cannot be updated",
        200,
        "VALIDATION_ERROR",
      );
    }
    await prisma.bookingEventSupplyItem.deleteMany({
      where: { bookingEventId: eventId, supplyItemId },
    });
    return successResponse(res, "Event supply item deleted", { ok: true });
  } catch (e) {
    console.error("deleteEventSupplyItem:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/** Mirrors `menuController` visibility for catalog menu rows. */
function deriveMenuIsGlobal(businessId, createdByUserId) {
  if (businessId == null || businessId === "") return true;
  if (createdByUserId == null || createdByUserId === "") return true;
  return false;
}

function canViewMenuItemForSupply(menu, contextBusinessId, userId) {
  if (menu.createdByUserId === userId) return true;
  if (menu.businessId != null && menu.businessId !== contextBusinessId) {
    return false;
  }
  if (menu.businessId == null) return menu.isGlobal === true;
  return deriveMenuIsGlobal(menu.businessId, menu.createdByUserId);
}

function normalizeMenuIngredients(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  return raw;
}

/**
 * GET /v1/bookings/:id/events/:eventId/suggestedSupplyFromMenu
 * Aggregates ingredient lines (with supply_item_id) from MenuItems referenced by the event snapshot,
 * scaled by quantity_per_plate per snapshot row.
 */
async function getSuggestedEventSupplyFromMenu(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const language = getRequestedLanguage(req);
    const bookingId = req.params.id;
    const eventId = req.params.eventId;

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true, status: true },
    });
    if (!booking) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (booking.status === "CANCELLED") {
      return errorResponse(
        res,
        "Cancelled booking cannot be used",
        422,
        "VALIDATION_ERROR",
      );
    }

    const event = await prisma.bookingEvent.findFirst({
      where: { id: eventId, bookingId },
      select: { id: true, eventSnapshot: true },
    });
    if (!event) {
      return errorResponse(res, "Event not found", 404, "NOT_FOUND");
    }

    const snap = event.eventSnapshot;
    if (snap == null || typeof snap !== "object") {
      return successResponse(res, "OK", {
        suggestions: [],
        legacy_without_supply: [],
      });
    }

    const menuItems = Array.isArray(snap.menu_items) ? snap.menu_items : [];
    if (menuItems.length === 0) {
      return successResponse(res, "OK", {
        suggestions: [],
        legacy_without_supply: [],
      });
    }

    /** menu_item_id -> total plate count for this event line */
    const platesByMenuId = new Map();
    for (const row of menuItems) {
      const mid = String(row?.id ?? "").trim();
      if (!mid) continue;
      const plates = Math.max(
        1,
        Math.floor(
          Number(row?.quantity_per_plate ?? row?.quantity ?? 1) || 1,
        ),
      );
      platesByMenuId.set(mid, (platesByMenuId.get(mid) ?? 0) + plates);
    }

    const menuIds = [...platesByMenuId.keys()];
    if (menuIds.length === 0) {
      return successResponse(res, "OK", {
        suggestions: [],
        legacy_without_supply: [],
      });
    }

    const menus = await prisma.menuItem.findMany({
      where: { id: { in: menuIds } },
      include: { category: true },
    });

    const visibleMenus = menus.filter((m) =>
      canViewMenuItemForSupply(m, businessId, userId),
    );

    /** key = supplyItemId + "\t" + unit -> scaled numeric qty */
    const buckets = new Map();
    const legacy = [];

    for (const menu of visibleMenus) {
      const plates = platesByMenuId.get(menu.id) ?? 1;
      const ingredients = normalizeMenuIngredients(menu.ingredients);
      for (const ing of ingredients) {
        const sidRaw = ing?.supply_item_id ?? ing?.supplyItemId;
        const sid = typeof sidRaw === "string" ? sidRaw.trim() : "";
        const rawQty = ing?.qty ?? ing?.quantity;
        const q = Number(String(rawQty ?? "").trim());
        const baseQty = Number.isFinite(q) && q > 0 ? q : 0;
        const unit = String(ing?.unit ?? "").trim() || "kg";
        const scaled = baseQty * plates;
        if (!sid) {
          const nm = String(ing?.name ?? "").trim();
          if (nm) {
            legacy.push({
              name: nm,
              unit,
              note: "no_supply_item_id",
            });
          }
          continue;
        }
        if (scaled <= 0) continue;
        const key = `${sid}\t${unit}`;
        buckets.set(key, (buckets.get(key) ?? 0) + scaled);
      }
    }

    const supplyIds = [
      ...new Set(
        [...buckets.keys()].map((k) => k.split("\t")[0]).filter(Boolean),
      ),
    ];

    if (supplyIds.length === 0) {
      return successResponse(res, "OK", {
        suggestions: [],
        legacy_without_supply: legacy,
      });
    }

    const supplyRows = await prisma.supplyItem.findMany({
      where: {
        id: { in: supplyIds },
        type: "INGREDIENT",
        isActive: true,
        OR: supplyVisibilityOrBranches(businessId, userId),
      },
      include: { category: true },
    });
    const supplyById = new Map(supplyRows.map((r) => [r.id, r]));

    const suggestions = [];
    for (const [key, total] of buckets) {
      const [sid, unitFromIng] = key.split("\t");
      const src = supplyById.get(sid);
      if (!src) continue;
      const unit =
        unitFromIng ||
        src.defaultUnit ||
        (src.unitOptions && src.unitOptions[0]) ||
        "kg";
      const qty = Math.min(999, Math.max(1, Math.ceil(Number(total))));
      suggestions.push({
        supply_item_id: src.id,
        name: resolveLocalizedName(src.name, language),
        quantity: qty,
        unit,
        category_slug: src.categorySlug,
      });
    }

    suggestions.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || "")),
    );

    return successResponse(res, "OK", {
      suggestions,
      legacy_without_supply: legacy,
    });
  } catch (e) {
    console.error("getSuggestedEventSupplyFromMenu:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function shareBookingSupplyItems(req, res) {
  return successResponse(res, "Share request queued", { ok: true });
}

async function shareEventSupplyItems(req, res) {
  return successResponse(res, "Share request queued", { ok: true });
}

function normalizeVendorPhone(raw) {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function serializeVendor(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? "",
    whatsappNo: row.whatsappNo ?? "",
    categorySlug: row.categorySlug ?? "",
    is_active: row.isActive,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

async function createVendor(req, res) {
  try {
    const businessId = req.businessId;
    const body = req.body || {};
    const name = String(body.name ?? "").trim();
    const whatsappNo = normalizeVendorPhone(
      body.whatsappNo ?? body.whatsapp_number ?? body.phone,
    );
    const categorySlug = String(body.categorySlug ?? body.category ?? "")
      .trim()
      .toLowerCase();
    const address = String(body.address ?? "").trim();
    if (!name) {
      return errorResponse(res, "Vendor name is required", 200, "VALIDATION_ERROR");
    }
    if (!whatsappNo || whatsappNo.length < 10) {
      return errorResponse(res, "Vendor phone is required", 200, "VALIDATION_ERROR");
    }
    if (!categorySlug) {
      return errorResponse(
        res,
        "Vendor category is required",
        200,
        "VALIDATION_ERROR",
      );
    }
    const row = await prisma.vendor.create({
      data: {
        businessId,
        name,
        whatsappNo,
        categorySlug,
        address: address || null,
      },
    });
    return successResponse(res, "Vendor created", serializeVendor(row));
  } catch (e) {
    console.error("createVendor:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function listVendors(req, res) {
  try {
    const businessId = req.businessId;
    const categorySlug = String(req.query.categorySlug ?? req.query.category ?? "")
      .trim()
      .toLowerCase();
    const q = String(req.query.q ?? "")
      .trim()
      .toLowerCase();
    const rows = await prisma.vendor.findMany({
      where: {
        businessId,
        isActive: true,
        ...(categorySlug ? { categorySlug } : {}),
      },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    });
    const filtered = q
      ? rows.filter((row) => {
          const hay = `${row.name} ${row.whatsappNo ?? ""} ${row.address ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : rows;
    return successResponse(res, "OK", { vendors: filtered.map(serializeVendor) });
  } catch (e) {
    console.error("listVendors:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function updateVendor(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const body = req.body || {};
    const existing = await prisma.vendor.findFirst({
      where: { id, businessId, isActive: true },
      select: { id: true },
    });
    if (!existing) return errorResponse(res, "Vendor not found", 404, "NOT_FOUND");
    const data = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim();
      if (!name) {
        return errorResponse(res, "Vendor name is required", 200, "VALIDATION_ERROR");
      }
      data.name = name;
    }
    if (
      body.whatsappNo !== undefined ||
      body.whatsapp_number !== undefined ||
      body.phone !== undefined
    ) {
      const whatsappNo = normalizeVendorPhone(
        body.whatsappNo ?? body.whatsapp_number ?? body.phone,
      );
      if (!whatsappNo || whatsappNo.length < 10) {
        return errorResponse(res, "Vendor phone is required", 200, "VALIDATION_ERROR");
      }
      data.whatsappNo = whatsappNo;
    }
    if (body.categorySlug !== undefined || body.category !== undefined) {
      const categorySlug = String(body.categorySlug ?? body.category ?? "")
        .trim()
        .toLowerCase();
      if (!categorySlug) {
        return errorResponse(
          res,
          "Vendor category is required",
          200,
          "VALIDATION_ERROR",
        );
      }
      data.categorySlug = categorySlug;
    }
    if (body.address !== undefined) {
      const address = String(body.address ?? "").trim();
      data.address = address || null;
    }
    const row = await prisma.vendor.update({ where: { id }, data });
    return successResponse(res, "Vendor updated", serializeVendor(row));
  } catch (e) {
    console.error("updateVendor:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function deleteVendor(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const existing = await prisma.vendor.findFirst({
      where: { id, businessId, isActive: true },
      select: { id: true },
    });
    if (!existing) return errorResponse(res, "Vendor not found", 404, "NOT_FOUND");
    await prisma.vendor.update({ where: { id }, data: { isActive: false } });
    return successResponse(res, "Vendor deleted", { id });
  } catch (e) {
    console.error("deleteVendor:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * POST /v1/generateSupplyListPdf
 * Body: { document_label, heading, subtitle?, company_name?, table_labels: { item, qty, unit }, groups: [{ title, lines: [{ name, quantity, unit }] }] }
 * Returns: application/pdf
 */
async function generateSupplyListPdf(req, res) {
  try {
    if (!req.businessId) {
      return errorResponse(
        res,
        "Business not found",
        200,
        "VALIDATION_ERROR",
        "NO_BUSINESS",
      );
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const buffer = await renderSupplyPdfBuffer({
      documentLabel: body.document_label,
      heading: body.heading,
      subtitle: body.subtitle,
      companyName: body.company_name,
      tableLabels: body.table_labels,
      groups: body.groups,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="supply-requirement.pdf"',
    );
    return res.status(200).send(buffer);
  } catch (e) {
    console.error("generateSupplyListPdf:", e);
    return errorResponse(
      res,
      e.message || "Server error",
      500,
      "SERVER_ERROR",
      e.message,
    );
  }
}

module.exports = {
  createSupplyItem,
  listSupplyItems,
  listSupplyItemCategories,
  updateSupplyItem,
  deleteSupplyItem,
  setBookingSupplyItems,
  getBookingSupplyItems,
  setEventSupplyItems,
  getEventSupplyItems,
  getSuggestedEventSupplyFromMenu,
  createVendor,
  listVendors,
  updateVendor,
  deleteVendor,
  updateEventSupplyItem,
  deleteEventSupplyItem,
  shareBookingSupplyItems,
  shareEventSupplyItems,
  generateSupplyListPdf,
};
