const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const {
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
} = require("../utils/localization");

const VALID_TYPES = new Set(["INGREDIENT", "UTENSIL"]);
const VALID_CATEGORIES = new Set(["VEGETABLES", "DAIRY", "GROCERIES", "UTENSILS"]);

function serializeSupplyItem(row, lang) {
  const localized = normalizeLocalizedName(row.name) || { en: "" };
  return {
    id: row.id,
    business_id: row.businessId,
    type: row.type,
    category: row.category,
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

async function createSupplyItem(req, res) {
  try {
    const businessId = req.businessId;
    const body = req.body || {};
    const type = String(body.type || "").toUpperCase();
    const category = String(body.category || "").toUpperCase();
    const names = normalizeLocalizedName(body.name ?? body.name_i18n);
    if (!VALID_TYPES.has(type)) {
      return errorResponse(res, "Invalid type", 200, "VALIDATION_ERROR");
    }
    if (!VALID_CATEGORIES.has(category)) {
      return errorResponse(res, "Invalid category", 200, "VALIDATION_ERROR");
    }
    if (!names) {
      return errorResponse(
        res,
        "All language names are required",
        200,
        "VALIDATION_ERROR",
      );
    }

    const row = await prisma.supplyItem.create({
      data: {
        businessId,
        type,
        category,
        name: names,
        unitOptions: Array.isArray(body.unit_options) ? body.unit_options : [],
        defaultUnit: String(body.default_unit || "pcs"),
        availableCount:
          body.available_count == null
            ? null
            : Math.max(0, parseInt(String(body.available_count), 10) || 0),
        photoUrl: body.photo_url ?? null,
      },
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

async function listSupplyItems(req, res) {
  try {
    const businessId = req.businessId;
    const language = getRequestedLanguage(req);
    const type = req.query.type ? String(req.query.type).toUpperCase() : undefined;
    const category = req.query.category
      ? String(req.query.category).toUpperCase()
      : undefined;
    const q = String(req.query.q ?? "").trim();
    const baseWhere = {
      businessId,
      isActive: true,
      ...(type && VALID_TYPES.has(type) ? { type } : {}),
      ...(category && VALID_CATEGORIES.has(category) ? { category } : {}),
    };
    const rows = await prisma.supplyItem.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
    });
    const filteredRows = q
      ? rows.filter((row) => {
          const haystack = [
            resolveLocalizedName(row.name, "en"),
            resolveLocalizedName(row.name, "hi"),
            resolveLocalizedName(row.name, "gu"),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q.toLowerCase());
        })
      : rows;
    return successResponse(res, "OK", {
      items: filteredRows.map((row) => serializeSupplyItem(row, language)),
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
      where: { id: { in: ids }, businessId, isActive: true },
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

    await prisma.$transaction(async (tx) => {
      await tx.bookingSupplyItem.deleteMany({ where: { bookingId } });
      if (payload.length) {
        await tx.bookingSupplyItem.createMany({
          data: payload.map((row) => {
            const source = byId.get(String(row.supply_item_id));
            return {
              bookingId,
              supplyItemId: source.id,
              quantity: Math.max(
                1,
                Math.min(999, parseInt(String(row.quantity), 10) || 1),
              ),
              unit: String(row.unit || source.defaultUnit || "pcs"),
              category: source.category,
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
        category: row.category,
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
      where: { id: { in: ids }, businessId, isActive: true },
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

    await prisma.$transaction(async (tx) => {
      await tx.bookingEventSupplyItem.deleteMany({
        where: { bookingEventId: eventId, itemType },
      });
      if (payload.length) {
        await tx.bookingEventSupplyItem.createMany({
          data: payload.map((row) => {
            const source = byId.get(String(row.supply_item_id));
            return {
              bookingEventId: eventId,
              supplyItemId: source.id,
              itemType,
              quantity: Math.max(
                1,
                Math.min(999, parseInt(String(row.quantity), 10) || 1),
              ),
              unit: String(row.unit || source.defaultUnit || "pcs"),
              category: source.category,
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
        category: row.category,
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

async function shareBookingSupplyItems(req, res) {
  return successResponse(res, "Share request queued", { ok: true });
}

async function shareEventSupplyItems(req, res) {
  return successResponse(res, "Share request queued", { ok: true });
}

module.exports = {
  createSupplyItem,
  listSupplyItems,
  updateSupplyItem,
  deleteSupplyItem,
  setBookingSupplyItems,
  getBookingSupplyItems,
  setEventSupplyItems,
  getEventSupplyItems,
  updateEventSupplyItem,
  deleteEventSupplyItem,
  shareBookingSupplyItems,
  shareEventSupplyItems,
};
