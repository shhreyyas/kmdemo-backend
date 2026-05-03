const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const {
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
} = require("../utils/localization");

const VALID_TYPES_FILTER = { type: "INGREDIENT" };

function supplyVisibilityOrBranches(businessId, userId) {
  return [
    { businessId, OR: [{ isGlobal: true }, { createdByUserId: userId }] },
    { businessId: null, OR: [{ createdByUserId: userId }, { isGlobal: true }] },
    { createdByUserId: userId },
  ];
}

function formatTitleDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(dt);
}

/**
 * @param {object} opts
 * @param {{ customerName?: string|null }|null} opts.booking
 * @param {{ functionType?: string|null }|null} opts.bookingEvent
 * @param {string[]} opts.categoryLabels resolved display labels (sorted unique)
 * @param {Date} [opts.at]
 */
function buildSavedListTitle({ booking, bookingEvent, categoryLabels, at }) {
  const now = at ?? new Date();
  const dateStr = formatTitleDate(now);
  const cats =
    categoryLabels.length === 1
      ? categoryLabels[0]
      : categoryLabels.join(", ");
  if (booking && bookingEvent) {
    const parts = [booking.customerName, bookingEvent.functionType].filter(
      (x) => x != null && String(x).trim() !== "",
    );
    const prefix = parts.length ? parts.join(" ").trim() : "Event";
    return `${prefix} - ${cats} - ${dateStr}`;
  }
  return `${cats} - ${dateStr}`;
}

function serializeSavedItem(row, lang) {
  const localized = normalizeLocalizedName(row.nameSnapshot) || { en: "" };
  return {
    supply_item_id: row.supplyItemId,
    quantity: row.quantity,
    unit: row.unit,
    category: row.categorySlug,
    name: resolveLocalizedName(row.nameSnapshot, lang),
    name_i18n: localized,
  };
}

async function createSupplySavedList(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const lang = getRequestedLanguage(req);
    const body = req.body || {};
    const bookingEventId = body.booking_event_id
      ? String(body.booking_event_id).trim()
      : null;
    const payload = Array.isArray(body.items) ? body.items : [];

    if (!businessId) {
      return errorResponse(res, "Business required", 200, "VALIDATION_ERROR");
    }
    if (payload.length === 0) {
      return errorResponse(res, "At least one item is required", 200, "VALIDATION_ERROR");
    }

    let booking = null;
    let bookingEvent = null;
    if (bookingEventId) {
      bookingEvent = await prisma.bookingEvent.findFirst({
        where: { id: bookingEventId },
        include: {
          booking: {
            select: {
              id: true,
              businessId: true,
              customerName: true,
            },
          },
        },
      });
      if (
        !bookingEvent ||
        bookingEvent.booking.businessId !== businessId
      ) {
        return errorResponse(res, "Event not found", 404, "NOT_FOUND");
      }
      booking = bookingEvent.booking;
    }

    const ids = [
      ...new Set(
        payload.map((row) => String(row.supply_item_id || "").trim()).filter(Boolean),
      ),
    ];
    const supplyRows = await prisma.supplyItem.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        ...VALID_TYPES_FILTER,
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

    const categorySlugsSet = new Set();
    for (const row of payload) {
      const source = byId.get(String(row.supply_item_id || "").trim());
      if (!source) continue;
      categorySlugsSet.add(source.categorySlug);
    }
    const catRows = await prisma.supplyItemCategory.findMany({
      where: { slug: { in: [...categorySlugsSet] }, isActive: true },
    });
    const catBySlug = new Map(catRows.map((c) => [c.slug, c]));
    const categoryLabels = [...categorySlugsSet]
      .sort()
      .map((slug) =>
        catBySlug.has(slug)
          ? resolveLocalizedName(catBySlug.get(slug).name, lang)
          : slug,
      );

    const title = buildSavedListTitle({
      booking,
      bookingEvent,
      categoryLabels,
      at: new Date(),
    });
    const categoriesLabel =
      categoryLabels.length <= 1
        ? categoryLabels[0] ?? ""
        : categoryLabels.join(", ");

    const list = await prisma.$transaction(async (tx) => {
      const created = await tx.supplySavedList.create({
        data: {
          businessId,
          createdByUserId: userId ?? null,
          title,
          bookingEventId: bookingEventId || null,
          categoriesLabel,
          items: {
            create: payload.map((row) => {
              const source = byId.get(String(row.supply_item_id || "").trim());
              let qty = Math.max(
                1,
                Math.min(999, parseInt(String(row.quantity), 10) || 1),
              );
              return {
                supplyItemId: source.id,
                quantity: qty,
                unit: String(row.unit || source.defaultUnit || "kg"),
                categorySlug: source.categorySlug,
                nameSnapshot: source.name,
              };
            }),
          },
        },
        include: {
          items: { include: { supplyItem: true } },
        },
      });
      return created;
    });

    const detail = await prisma.supplySavedList.findFirst({
      where: { id: list.id, businessId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
      },
    });

    return successResponse(res, "Supply list saved", {
      list: formatSavedListDetail(detail, lang),
    });
  } catch (e) {
    console.error("createSupplySavedList:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

function formatSavedListSummary(row, lang) {
  return {
    id: row.id,
    title: row.title,
    item_count: row._count?.items ?? row.items?.length ?? 0,
    categories_label: row.categoriesLabel ?? null,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function formatSavedListDetail(row, lang) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    booking_event_id: row.bookingEventId ?? null,
    categories_label: row.categoriesLabel ?? null,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    items: (row.items || []).map((it) => serializeSavedItem(it, lang)),
  };
}

async function listSupplySavedLists(req, res) {
  try {
    const businessId = req.businessId;
    if (!businessId) {
      return errorResponse(res, "Business required", 200, "VALIDATION_ERROR");
    }
    const lang = getRequestedLanguage(req);
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;

    const where = { businessId };

    const [total, rows] = await prisma.$transaction([
      prisma.supplySavedList.count({ where }),
      prisma.supplySavedList.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          categoriesLabel: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { items: true } },
        },
      }),
    ]);

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
    return successResponse(res, "OK", {
      lists: rows.map((r) => formatSavedListSummary(r, lang)),
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_more: page < totalPages,
      },
    });
  } catch (e) {
    console.error("listSupplySavedLists:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function getSupplySavedList(req, res) {
  try {
    const businessId = req.businessId;
    const lang = getRequestedLanguage(req);
    const id = String(req.params.id || "").trim();
    if (!businessId || !id) {
      return errorResponse(res, "Invalid request", 200, "VALIDATION_ERROR");
    }

    const row = await prisma.supplySavedList.findFirst({
      where: { id, businessId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!row) {
      return errorResponse(res, "List not found", 404, "NOT_FOUND");
    }

    return successResponse(res, "OK", {
      list: formatSavedListDetail(row, lang),
    });
  } catch (e) {
    console.error("getSupplySavedList:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function updateSupplySavedList(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const lang = getRequestedLanguage(req);
    const id = String(req.params.id || "").trim();
    const body = req.body || {};
    const payload = Array.isArray(body.items) ? body.items : [];

    if (!businessId || !id) {
      return errorResponse(res, "Invalid request", 200, "VALIDATION_ERROR");
    }
    if (payload.length === 0) {
      return errorResponse(res, "At least one item is required", 200, "VALIDATION_ERROR");
    }

    const existing = await prisma.supplySavedList.findFirst({
      where: { id, businessId },
      include: {
        bookingEvent: {
          include: {
            booking: {
              select: {
                id: true,
                businessId: true,
                customerName: true,
              },
            },
          },
        },
      },
    });
    if (!existing) {
      return errorResponse(res, "List not found", 404, "NOT_FOUND");
    }

    let booking = null;
    const bookingEvent = existing.bookingEvent;
    if (
      bookingEvent?.booking &&
      bookingEvent.booking.businessId === businessId
    ) {
      booking = bookingEvent.booking;
    }

    const ids = [
      ...new Set(
        payload.map((row) => String(row.supply_item_id || "").trim()).filter(Boolean),
      ),
    ];
    const supplyRows = await prisma.supplyItem.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        ...VALID_TYPES_FILTER,
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

    const categorySlugsSet = new Set();
    for (const row of payload) {
      const source = byId.get(String(row.supply_item_id || "").trim());
      if (!source) continue;
      categorySlugsSet.add(source.categorySlug);
    }
    const catRows = await prisma.supplyItemCategory.findMany({
      where: { slug: { in: [...categorySlugsSet] }, isActive: true },
    });
    const catBySlug = new Map(catRows.map((c) => [c.slug, c]));
    const categoryLabels = [...categorySlugsSet]
      .sort()
      .map((slug) =>
        catBySlug.has(slug)
          ? resolveLocalizedName(catBySlug.get(slug).name, lang)
          : slug,
      );

    const title = buildSavedListTitle({
      booking,
      bookingEvent,
      categoryLabels,
      at: new Date(),
    });
    const categoriesLabel =
      categoryLabels.length <= 1
        ? categoryLabels[0] ?? ""
        : categoryLabels.join(", ");

    await prisma.$transaction(async (tx) => {
      await tx.supplySavedListItem.deleteMany({ where: { listId: id } });
      await tx.supplySavedList.update({
        where: { id },
        data: {
          title,
          categoriesLabel,
          items: {
            create: payload.map((row) => {
              const source = byId.get(String(row.supply_item_id || "").trim());
              let qty = Math.max(
                1,
                Math.min(999, parseInt(String(row.quantity), 10) || 1),
              );
              return {
                supplyItemId: source.id,
                quantity: qty,
                unit: String(row.unit || source.defaultUnit || "kg"),
                categorySlug: source.categorySlug,
                nameSnapshot: source.name,
              };
            }),
          },
        },
      });
    });

    const detail = await prisma.supplySavedList.findFirst({
      where: { id, businessId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
      },
    });

    return successResponse(res, "Supply list updated", {
      list: formatSavedListDetail(detail, lang),
    });
  } catch (e) {
    console.error("updateSupplySavedList:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

module.exports = {
  createSupplySavedList,
  listSupplySavedLists,
  getSupplySavedList,
  updateSupplySavedList,
};
