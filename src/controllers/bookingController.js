const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const { successResponse, errorResponse } = require("../utils/response");
const { sendBookingConfirmationEmail } = require("../utils/email");
const { getRequestedLanguage, resolveLocalizedName } = require("../utils/localization");

function deriveIsGlobal(businessId, createdByUserId) {
  if (businessId == null || businessId === "") return true;
  if (createdByUserId == null || createdByUserId === "") return true;
  return false;
}

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

function num(d) {
  if (d == null) return 0;
  const n = typeof d === "number" ? d : Number(d);
  return Number.isFinite(n) ? n : 0;
}

function computePricingFromSnapshots(rows, guestCount, discount, servicePct, taxPct) {
  const guests = Math.max(0, Math.floor(Number(guestCount) || 0));
  const perPlateTotal = rows.reduce((s, r) => {
    const q = r.quantity != null ? Math.max(1, parseInt(String(r.quantity), 10) || 1) : 1;
    return s + num(r.pricePerPlateSnapshot) * q;
  }, 0);
  const subtotal = perPlateTotal * guests;
  const serviceChargeAmount = subtotal * (servicePct / 100);
  const taxAmount = subtotal * (taxPct / 100);
  const disc = Math.max(0, num(discount));
  const totalDue = Math.max(0, subtotal + serviceChargeAmount + taxAmount - disc);
  return {
    perPlateTotal,
    subtotal,
    serviceChargeAmount,
    taxAmount,
    totalDue,
  };
}

function paymentStatusFromAmounts(amountPaid, totalDue) {
  const paid = num(amountPaid);
  const due = num(totalDue);
  if (paid <= 0) return "PENDING";
  if (paid >= due - 0.01) return "PAID";
  return "PARTIAL";
}

/**
 * Menu edits allowed only until 24h before the event start (same rule as the mobile app).
 */
function canEditMenuBeforeEvent(eventAt) {
  if (!eventAt) return true;
  const start = new Date(eventAt).getTime();
  if (Number.isNaN(start)) return true;
  if (start <= Date.now()) return false;
  return start - Date.now() > 24 * 60 * 60 * 1000;
}

function deriveEventSubtotal(ev) {
  if (ev?.eventTotal != null) return num(ev.eventTotal);
  const guests = Math.max(0, Number(ev?.guestCount ?? 0) || 0);
  const snapshotPrice = Number(ev?.eventSnapshot?.price_per_plate ?? 0) || 0;
  return guests * snapshotPrice;
}

/**
 * Food + booking-level service/tax/discount (aligned with app `getBookingPricingBreakdown`).
 * Used when stored `totalDue` is 0 or too low — e.g. confirmBooking only priced root guestCount
 * while multiple events each have their own totals.
 */
function computeBookingTotalDueFromEvents(booking) {
  const events = booking.events || [];
  let foodSum = 0;
  for (const ev of events) {
    foodSum += deriveEventSubtotal(ev);
  }
  if (foodSum <= 0) return 0;

  let serviceAmt = num(booking.serviceChargeAmount);
  const servicePct = num(booking.serviceChargePct);
  if (serviceAmt <= 0 && servicePct > 0) {
    serviceAmt = foodSum * (servicePct / 100);
  }

  let taxAmt = num(booking.taxAmount);
  const taxPct = num(booking.taxPct);
  if (taxAmt <= 0 && taxPct > 0) {
    taxAmt = (foodSum + serviceAmt) * (taxPct / 100);
  }

  const disc = num(booking.discountAmount);
  return Math.max(0, foodSum + serviceAmt + taxAmt - disc);
}

/** Prefer max(stored, event-derived) when events imply a higher balance than `booking.totalDue`. */
function resolveTotalDueForPayment(booking) {
  const stored = num(booking.totalDue);
  const fromEvents = computeBookingTotalDueFromEvents(booking);
  if (fromEvents > 0) return Math.max(stored, fromEvents);
  return stored;
}

function serializeBookingEvent(ev) {
  return {
    id: ev.id,
    booking_id: ev.bookingId,
    event_at: ev.eventAt?.toISOString?.() ?? ev.eventAt ?? null,
    event_location: ev.eventLocation ?? null,
    function_type: ev.functionType ?? null,
    guest_count: ev.guestCount ?? null,
    notes: ev.notes ?? null,
    status: ev.status ?? "PENDING",
    dish_id: ev.dishId ?? null,
    parent_dish_id: ev.parentDishId ?? null,
    is_template: ev.isTemplate ?? null,
    event_total: ev.eventTotal != null ? num(ev.eventTotal) : null,
    event_subtotal: deriveEventSubtotal(ev),
    event_snapshot: ev.eventSnapshot ?? null,
    created_at: ev.createdAt?.toISOString?.() ?? ev.createdAt,
    updated_at: ev.updatedAt?.toISOString?.() ?? ev.updatedAt,
  };
}

async function enrichEventSnapshotMenuImages(booking) {
  if (!booking || !Array.isArray(booking.events) || booking.events.length === 0) {
    return booking;
  }

  const idSet = new Set();
  for (const ev of booking.events) {
    const rows = ev?.eventSnapshot?.menu_items;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const id = String(row?.id ?? "").trim();
      if (id) idSet.add(id);
    }
  }

  if (idSet.size === 0) return booking;

  const snapshotImageByMenuId = new Map();
  for (const mi of booking.menuItems || []) {
    const mid = String(mi?.menuItemId ?? "").trim();
    if (!mid) continue;
    if (mi?.imageUrlSnapshot) {
      snapshotImageByMenuId.set(mid, mi.imageUrlSnapshot);
    }
  }

  const menuRows = await prisma.menuItem.findMany({
    where: { id: { in: [...idSet] } },
    select: { id: true, imageUrl: true },
  });
  const liveImageByMenuId = new Map(menuRows.map((m) => [m.id, m.imageUrl || null]));

  const enrichedEvents = booking.events.map((ev) => {
    const snapshot = ev?.eventSnapshot;
    if (!snapshot || !Array.isArray(snapshot.menu_items)) return ev;
    const enrichedMenuItems = snapshot.menu_items.map((row) => {
      if (row?.image_url) return row;
      const id = String(row?.id ?? "").trim();
      if (!id) return row;
      const imageUrl = snapshotImageByMenuId.get(id) || liveImageByMenuId.get(id) || null;
      return imageUrl ? { ...row, image_url: imageUrl } : row;
    });
    return {
      ...ev,
      eventSnapshot: {
        ...snapshot,
        menu_items: enrichedMenuItems,
      },
    };
  });

  return {
    ...booking,
    events: enrichedEvents,
  };
}

async function generateUniqueBookingCode(tx, businessId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const n = Math.floor(Math.random() * 1000);
    const bookingCode = `KMT-R-${String(n).padStart(3, "0")}`;
    const exists = await tx.booking.findFirst({
      where: { businessId, bookingCode },
      select: { id: true },
    });
    if (!exists) return bookingCode;
  }
  throw new Error("BOOKING_CODE_ALLOC_FAILED");
}

function serializeBooking(b, { includePayments = true } = {}) {
  const menuItems = (b.menuItems || []).map((mi) => ({
    id: mi.id,
    menu_item_id: mi.menuItemId,
    quantity: mi.quantity ?? 1,
    price_per_plate_snapshot: num(mi.pricePerPlateSnapshot),
    name_snapshot: mi.nameSnapshot,
    image_url_snapshot: mi.imageUrlSnapshot,
  }));

  const payments =
    includePayments && b.payments
      ? b.payments.map((p) => ({
          id: p.id,
          amount: num(p.amount),
          method: p.method,
          created_at: p.createdAt?.toISOString?.() ?? p.createdAt,
        }))
      : undefined;

  let serializedEvents = (b.events || []).map(serializeBookingEvent);
  const hasEvents = serializedEvents.length > 0;
  const bookingAtIso = b.eventAt?.toISOString?.() ?? b.eventAt ?? null;

  if (hasEvents) {
    const first = serializedEvents[0];
    serializedEvents = [
      {
        ...first,
        event_location: first.event_location ?? b.eventLocation ?? null,
        guest_count: first.guest_count ?? b.guestCount ?? null,
        event_at: first.event_at ?? bookingAtIso,
        function_type: first.function_type ?? b.functionType ?? null,
      },
      ...serializedEvents.slice(1),
    ];
  }

  const firstEvent = hasEvents ? serializedEvents[0] : null;
  const rootAt = firstEvent?.event_at ?? bookingAtIso;
  const rootLoc = firstEvent?.event_location ?? b.eventLocation ?? null;
  const rootGuests = firstEvent?.guest_count ?? b.guestCount ?? null;
  const rootFn = firstEvent?.function_type ?? b.functionType ?? null;

  return {
    id: b.id,
    business_id: b.businessId,
    status: b.status,
    step_number: b.stepNumber,
    booking_code: b.bookingCode,
    customer_name: b.customerName,
    customer_phone: b.customerPhone,
    customer_email: b.customerEmail,
    event_range_start: b.eventRangeStart?.toISOString?.() ?? b.eventRangeStart,
    event_range_end: b.eventRangeEnd?.toISOString?.() ?? b.eventRangeEnd,
    event_at: rootAt,
    event_location: rootLoc,
    function_type: rootFn,
    guest_count: rootGuests,
    ...(!hasEvents ? { notes: b.notes } : {}),
    discount_amount: num(b.discountAmount),
    service_charge_pct: num(b.serviceChargePct),
    tax_pct: num(b.taxPct),
    subtotal: num(b.subtotal),
    service_charge_amount: num(b.serviceChargeAmount),
    tax_amount: num(b.taxAmount),
    total_due: num(b.totalDue),
    /** Mirrors `total_due` for clients that resolve totals from `final_amount`. */
    final_amount: num(b.totalDue),
    amount_paid: num(b.amountPaid),
    payment_status: b.paymentStatus,
    menu_items: menuItems,
    events: serializedEvents,
    ...(payments !== undefined ? { payments } : {}),
    can_edit_menu: canEditMenuBeforeEvent(firstEvent?.event_at ?? bookingAtIso),
    created_at: b.createdAt?.toISOString?.() ?? b.createdAt,
    updated_at: b.updatedAt?.toISOString?.() ?? b.updatedAt,
    completed_at: b.completedAt?.toISOString?.() ?? b.completedAt ?? null,
  };
}

function bookingEventTimestampsFromRow(b) {
  const events = [...(b.events || [])].sort((a, c) => {
    const ta = a.eventAt ? new Date(a.eventAt).getTime() : 0;
    const tb = c.eventAt ? new Date(c.eventAt).getTime() : 0;
    return ta - tb;
  });
  const ts = [];
  for (const ev of events) {
    if (ev.eventAt) {
      const t = new Date(ev.eventAt).getTime();
      if (!Number.isNaN(t)) ts.push(t);
    }
  }
  if (ts.length === 0 && b.eventAt) {
    const t = new Date(b.eventAt).getTime();
    if (!Number.isNaN(t)) ts.push(t);
  }
  return ts.sort((a, c) => a - c);
}

function bookingLatestEventMsFromRow(b) {
  const ts = bookingEventTimestampsFromRow(b);
  return ts.length ? ts[ts.length - 1] : NaN;
}

/**
 * Past-day confirmed booking that is still waiting manual completion.
 * Mirrors app-side rule used by dashboard/schedule.
 */
function bookingNeedsPastDayManualCompleteFromRow(b, now = new Date()) {
  if (!b || b.status !== "CONFIRMED") return false;
  if (b.completedAt) return false;
  const latest = bookingLatestEventMsFromRow(b);
  if (Number.isNaN(latest)) return false;
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  return latest < startToday.getTime();
}

async function loadBookingForBusiness(bookingId, businessId, extras = {}) {
  return prisma.booking.findFirst({
    where: { id: bookingId, businessId },
    include: {
      menuItems: true,
      events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
      ...(extras.includePayments
        ? { payments: { orderBy: { createdAt: "desc" } } }
        : {}),
    },
  });
}

/**
 * POST /v1/createBooking — create draft
 */
async function createBooking(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const body = req.body || {};

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        defaultServiceChargePct: true,
        defaultTaxPct: true,
      },
    });
    if (!business) {
      return errorResponse(res, "Business not found", 404, "NOT_FOUND");
    }

    const firstEvent =
      Array.isArray(body.events) && body.events.length > 0 ? body.events[0] : null;
    const sc = num(body.service_charge_pct ?? business.defaultServiceChargePct);
    const txp = num(body.tax_pct ?? business.defaultTaxPct);
    const pricing = computePricingFromSnapshots(
      [],
      body.guest_count ?? firstEvent?.guest_count ?? 0,
      body.discount_amount ?? 0,
      sc,
      txp,
    );

    const booking = await prisma.booking.create({
      data: {
        businessId,
        status: "DRAFT",
        stepNumber: Math.min(5, Math.max(1, parseInt(body.step_number, 10) || 1)),
        customerName: body.customer_name ?? null,
        customerPhone: body.customer_phone ?? null,
        customerEmail: body.customer_email ?? null,
        eventRangeStart: body.event_range_start
          ? new Date(body.event_range_start)
          : null,
        eventRangeEnd: body.event_range_end
          ? new Date(body.event_range_end)
          : null,
        eventAt:
          (firstEvent?.event_at ?? body.event_at)
            ? new Date(firstEvent?.event_at ?? body.event_at)
            : null,
        eventLocation: firstEvent?.event_location ?? body.event_location ?? null,
        functionType: firstEvent?.function_type ?? body.function_type ?? null,
        guestCount:
          firstEvent?.guest_count != null
            ? parseInt(firstEvent.guest_count, 10)
            : (body.guest_count != null ? parseInt(body.guest_count, 10) : null),
        notes: firstEvent?.notes ?? body.notes ?? null,
        discountAmount: new Prisma.Decimal(String(body.discount_amount ?? 0)),
        serviceChargePct: new Prisma.Decimal(String(sc)),
        taxPct: new Prisma.Decimal(String(txp)),
        subtotal: new Prisma.Decimal(String(pricing.subtotal)),
        serviceChargeAmount: new Prisma.Decimal(String(pricing.serviceChargeAmount)),
        taxAmount: new Prisma.Decimal(String(pricing.taxAmount)),
        totalDue: new Prisma.Decimal(String(pricing.totalDue)),
      },
    });

    if (Array.isArray(body.events) && body.events.length > 0) {
      await prisma.bookingEvent.createMany({
        data: body.events.map((ev) => ({
          bookingId: booking.id,
          eventAt: ev.event_at ? new Date(ev.event_at) : null,
          eventLocation: ev.event_location ?? null,
          functionType: ev.function_type ?? null,
          guestCount: ev.guest_count != null ? parseInt(ev.guest_count, 10) : null,
          notes: ev.notes ?? null,
          status: ev.status ?? "PENDING",
          dishId: ev.dish_id ?? null,
          parentDishId: ev.parent_dish_id ?? null,
          isTemplate: ev.is_template ?? null,
          eventSnapshot: ev.event_snapshot ?? null,
          eventTotal:
            ev.event_total != null ? new Prisma.Decimal(String(ev.event_total)) : null,
        })),
      });
    }

    const withMenu = await loadBookingForBusiness(booking.id, businessId, {
      includePayments: true,
    });
    return successResponse(res, "Draft created", serializeBooking(withMenu));
  } catch (e) {
    console.error("createBooking:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * PATCH /v1/bookings/:id — draft or confirmed (menu edit on confirmed only before cutoff day)
 */
async function patchBooking(req, res) {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const bookingId = req.params.id;
    const body = req.body || {};

    const existing = await loadBookingForBusiness(bookingId, businessId, {
      includePayments: true,
    });
    if (!existing) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (existing.status === "CANCELLED") {
      return errorResponse(res, "Cancelled booking cannot be updated", 200, "VALIDATION_ERROR");
    }

    // Optimistic concurrency guard (plan: updated_at conflict check).
    if (body.updated_at) {
      const clientUpdatedAt = new Date(body.updated_at).toISOString();
      const serverUpdatedAt = new Date(existing.updatedAt).toISOString();
      if (clientUpdatedAt !== serverUpdatedAt) {
        return errorResponse(
          res,
          "This booking changed on another device. Please refresh before saving.",
          409,
          "WRITE_CONFLICT",
        );
      }
    }

    const isDraft = existing.status === "DRAFT";
    const menuItemIds = Array.isArray(body.menu_item_ids) ? body.menu_item_ids : null;
    const menuLines = Array.isArray(body.menu_items) ? body.menu_items : null;
    const firstEvent =
      Array.isArray(body.events) && body.events.length > 0 ? body.events[0] : null;
    const nextEventAt = firstEvent?.event_at ?? body.event_at;
    const nextEventLocation = firstEvent?.event_location ?? body.event_location;
    const nextFunctionType = firstEvent?.function_type ?? body.function_type;
    const nextGuestCount = firstEvent?.guest_count ?? body.guest_count;
    const nextNotes = firstEvent?.notes ?? body.notes;

    // Post-confirm lock granularity:
    // confirmed bookings allow only payment/status flows via dedicated endpoints;
    // block menu/event editing from patch route.
    if (!isDraft) {
      const touchesMenu = menuItemIds != null || menuLines != null;
      const touchesEvents = Array.isArray(body.events);
      const touchesEventFields =
        body.event_at !== undefined ||
        body.event_location !== undefined ||
        body.function_type !== undefined ||
        body.guest_count !== undefined ||
        body.notes !== undefined;
      if (touchesMenu || touchesEvents || touchesEventFields) {
        return errorResponse(
          res,
          "Confirmed booking is locked for event/menu updates.",
          200,
          "VALIDATION_ERROR",
        );
      }
    }

    if (menuItemIds != null || menuLines != null) {
      if (!isDraft && !canEditMenuBeforeEvent(existing.eventAt)) {
        return errorResponse(
          res,
          "Menu can no longer be edited for this event date",
          200,
          "VALIDATION_ERROR",
        );
      }

      let lines = [];
      if (menuLines && menuLines.length > 0) {
        lines = menuLines.map((row) => ({
          id: String(row.menu_item_id ?? row.menuItemId ?? "").trim(),
          qty: Math.max(1, Math.min(999, parseInt(String(row.quantity ?? 1), 10) || 1)),
        })).filter((x) => x.id);
      } else if (menuItemIds) {
        lines = menuItemIds.map((x) => ({
          id: String(x).trim(),
          qty: 1,
        })).filter((x) => x.id);
      }

      const merged = new Map();
      for (const line of lines) {
        merged.set(line.id, (merged.get(line.id) ?? 0) + line.qty);
      }
      const mergedLines = [...merged.entries()].map(([id, qty]) => ({
        id,
        qty: Math.min(999, Math.max(1, qty)),
      }));

      const ids = mergedLines.map((l) => l.id);
      const menus = await prisma.menuItem.findMany({
        where: { id: { in: ids } },
      });
      if (menus.length !== ids.length) {
        return errorResponse(res, "One or more menu items not found", 200, "VALIDATION_ERROR");
      }
      for (const m of menus) {
        if (!canViewMenuItem(m, businessId, userId)) {
          return errorResponse(res, "Forbidden menu item in selection", 403, "FORBIDDEN");
        }
      }

      await prisma.bookingMenuItem.deleteMany({ where: { bookingId } });
      const menuById = new Map(menus.map((m) => [m.id, m]));
      const createRows = mergedLines.map((line) => {
        const m = menuById.get(line.id);
        return {
          bookingId,
          menuItemId: m.id,
          quantity: line.qty,
          pricePerPlateSnapshot: m.pricePerPerson,
          nameSnapshot: resolveLocalizedName(m.name, requestedLanguage),
          imageUrlSnapshot: m.imageUrl,
        };
      });
      if (createRows.length) {
        await prisma.bookingMenuItem.createMany({ data: createRows });
      }
    }

    if (Array.isArray(body.events)) {
      await prisma.$transaction(async (tx) => {
        const existingEvents = await tx.bookingEvent.findMany({
          where: { bookingId },
          select: {
            id: true,
            eventAt: true,
            eventLocation: true,
            functionType: true,
            guestCount: true,
            notes: true,
            status: true,
            dishId: true,
            parentDishId: true,
            isTemplate: true,
            eventSnapshot: true,
            eventTotal: true,
          },
        });
        const existingById = new Map(existingEvents.map((ev) => [ev.id, ev]));
        const keepIds = [];

        for (const rawEvent of body.events) {
          const ev = rawEvent || {};
          const current = ev.id ? existingById.get(ev.id) : null;
          const payload = current
            ? {
                eventAt:
                  ev.event_at !== undefined
                    ? (ev.event_at ? new Date(ev.event_at) : null)
                    : current.eventAt,
                eventLocation:
                  ev.event_location !== undefined ? ev.event_location : current.eventLocation,
                functionType:
                  ev.function_type !== undefined ? ev.function_type : current.functionType,
                guestCount:
                  ev.guest_count !== undefined
                    ? (ev.guest_count != null ? parseInt(ev.guest_count, 10) : null)
                    : current.guestCount,
                notes: ev.notes !== undefined ? ev.notes : current.notes,
                status: ev.status !== undefined ? ev.status : current.status,
                dishId: ev.dish_id !== undefined ? ev.dish_id : current.dishId,
                parentDishId:
                  ev.parent_dish_id !== undefined ? ev.parent_dish_id : current.parentDishId,
                isTemplate:
                  ev.is_template !== undefined ? ev.is_template : current.isTemplate,
                eventSnapshot:
                  ev.event_snapshot !== undefined ? ev.event_snapshot : current.eventSnapshot,
                eventTotal:
                  ev.event_total !== undefined
                    ? (ev.event_total != null ? new Prisma.Decimal(String(ev.event_total)) : null)
                    : current.eventTotal,
              }
            : {
                eventAt: ev.event_at ? new Date(ev.event_at) : null,
                eventLocation: ev.event_location ?? null,
                functionType: ev.function_type ?? null,
                guestCount: ev.guest_count != null ? parseInt(ev.guest_count, 10) : null,
                notes: ev.notes ?? null,
                status: ev.status ?? "PENDING",
                dishId: ev.dish_id ?? null,
                parentDishId: ev.parent_dish_id ?? null,
                isTemplate: ev.is_template ?? null,
                eventSnapshot: ev.event_snapshot ?? null,
                eventTotal:
                  ev.event_total != null ? new Prisma.Decimal(String(ev.event_total)) : null,
              };

          if (current) {
            await tx.bookingEvent.update({
              where: { id: ev.id },
              data: payload,
            });
            keepIds.push(ev.id);
          } else {
            const created = await tx.bookingEvent.create({
              data: {
                bookingId,
                ...payload,
              },
              select: { id: true },
            });
            keepIds.push(created.id);
          }
        }

        await tx.bookingEvent.deleteMany({
          where: {
            bookingId,
            ...(keepIds.length ? { id: { notIn: keepIds } } : {}),
          },
        });
      });
    }

    const guests =
      body.guest_count != null ? parseInt(body.guest_count, 10) : existing.guestCount ?? 0;
    const discount = body.discount_amount != null ? num(body.discount_amount) : num(existing.discountAmount);
    const sc =
      body.service_charge_pct != null ? num(body.service_charge_pct) : num(existing.serviceChargePct);
    const txp = body.tax_pct != null ? num(body.tax_pct) : num(existing.taxPct);

    const menuRows = await prisma.bookingMenuItem.findMany({ where: { bookingId } });
    const pricing = computePricingFromSnapshots(menuRows, guests, discount, sc, txp);

    if (num(existing.amountPaid) > pricing.totalDue + 0.02) {
      return errorResponse(
        res,
        "Recorded payments exceed the new total. Adjust before changing the booking.",
        200,
        "VALIDATION_ERROR",
      );
    }

    const baseData = {
      customerName: body.customer_name !== undefined ? body.customer_name : existing.customerName,
      customerPhone: body.customer_phone !== undefined ? body.customer_phone : existing.customerPhone,
      customerEmail: body.customer_email !== undefined ? body.customer_email : existing.customerEmail,
      eventRangeStart:
        body.event_range_start !== undefined
          ? (body.event_range_start ? new Date(body.event_range_start) : null)
          : existing.eventRangeStart,
      eventRangeEnd:
        body.event_range_end !== undefined
          ? (body.event_range_end ? new Date(body.event_range_end) : null)
          : existing.eventRangeEnd,
      eventAt:
        nextEventAt !== undefined ? (nextEventAt ? new Date(nextEventAt) : null) : existing.eventAt,
      eventLocation: nextEventLocation !== undefined ? nextEventLocation : existing.eventLocation,
      functionType: nextFunctionType !== undefined ? nextFunctionType : existing.functionType,
      guestCount: nextGuestCount != null ? parseInt(nextGuestCount, 10) : existing.guestCount,
      notes: nextNotes !== undefined ? nextNotes : existing.notes,
      discountAmount: new Prisma.Decimal(String(discount)),
      serviceChargePct: new Prisma.Decimal(String(sc)),
      taxPct: new Prisma.Decimal(String(txp)),
      subtotal: new Prisma.Decimal(String(pricing.subtotal)),
      serviceChargeAmount: new Prisma.Decimal(String(pricing.serviceChargeAmount)),
      taxAmount: new Prisma.Decimal(String(pricing.taxAmount)),
      totalDue: new Prisma.Decimal(String(pricing.totalDue)),
      paymentStatus: paymentStatusFromAmounts(existing.amountPaid, pricing.totalDue),
    };

    const draftOnly =
      isDraft && body.step_number != null
        ? {
            stepNumber: Math.min(5, Math.max(1, parseInt(body.step_number, 10))),
          }
        : {};

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        ...baseData,
        ...draftOnly,
      },
      include: {
        menuItems: true,
        events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    return successResponse(res, "Booking updated", serializeBooking(updated));
  } catch (e) {
    console.error("patchBooking:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * PATCH /v1/bookings/:id/updateEvent/:eventId — update a single event safely
 */
async function updateEvent(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;
    const eventId = req.params.eventId;
    const body = req.body || {};

    const existing = await loadBookingForBusiness(bookingId, businessId, {
      includePayments: true,
    });
    if (!existing) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (existing.status === "CANCELLED") {
      return errorResponse(res, "Cancelled booking cannot be updated", 200, "VALIDATION_ERROR");
    }
    if (existing.status !== "DRAFT") {
      return errorResponse(
        res,
        "Confirmed booking is locked for event/menu updates.",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (body.updated_at) {
      const clientUpdatedAt = new Date(body.updated_at).toISOString();
      const serverUpdatedAt = new Date(existing.updatedAt).toISOString();
      if (clientUpdatedAt !== serverUpdatedAt) {
        return errorResponse(
          res,
          "This booking changed on another device. Please refresh before saving.",
          409,
          "WRITE_CONFLICT",
        );
      }
    }

    const current = (existing.events || []).find((ev) => ev.id === eventId);
    if (!current) {
      return errorResponse(res, "Event not found", 404, "NOT_FOUND");
    }

    await prisma.bookingEvent.update({
      where: { id: eventId },
      data: {
        eventAt:
          body.event_at !== undefined ? (body.event_at ? new Date(body.event_at) : null) : current.eventAt,
        eventLocation:
          body.event_location !== undefined ? body.event_location : current.eventLocation,
        functionType:
          body.function_type !== undefined ? body.function_type : current.functionType,
        guestCount:
          body.guest_count !== undefined
            ? (body.guest_count != null ? parseInt(body.guest_count, 10) : null)
            : current.guestCount,
        notes: body.notes !== undefined ? body.notes : current.notes,
        status: body.status !== undefined ? body.status : current.status,
        dishId: body.dish_id !== undefined ? body.dish_id : current.dishId,
        parentDishId:
          body.parent_dish_id !== undefined ? body.parent_dish_id : current.parentDishId,
        isTemplate: body.is_template !== undefined ? body.is_template : current.isTemplate,
        eventSnapshot:
          body.event_snapshot !== undefined ? body.event_snapshot : current.eventSnapshot,
        eventTotal:
          body.event_total !== undefined
            ? (body.event_total != null ? new Prisma.Decimal(String(body.event_total)) : null)
            : current.eventTotal,
      },
    });

    if (body.step_number != null) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          stepNumber: Math.min(5, Math.max(1, parseInt(body.step_number, 10) || 1)),
        },
      });
    }

    const updated = await loadBookingForBusiness(bookingId, businessId, {
      includePayments: true,
    });
    return successResponse(res, "Event updated", serializeBooking(updated));
  } catch (e) {
    console.error("updateEvent:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * POST /v1/bookings/:id/createEvent — create single event in draft booking
 */
async function createEvent(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;
    const body = req.body || {};

    const existing = await loadBookingForBusiness(bookingId, businessId, {
      includePayments: true,
    });
    if (!existing) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (existing.status === "CANCELLED") {
      return errorResponse(res, "Cancelled booking cannot be updated", 200, "VALIDATION_ERROR");
    }
    if (existing.status !== "DRAFT") {
      return errorResponse(
        res,
        "Confirmed booking is locked for event/menu updates.",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (body.updated_at) {
      const clientUpdatedAt = new Date(body.updated_at).toISOString();
      const serverUpdatedAt = new Date(existing.updatedAt).toISOString();
      if (clientUpdatedAt !== serverUpdatedAt) {
        return errorResponse(
          res,
          "This booking changed on another device. Please refresh before saving.",
          409,
          "WRITE_CONFLICT",
        );
      }
    }

    await prisma.bookingEvent.create({
      data: {
        bookingId,
        eventAt: body.event_at ? new Date(body.event_at) : null,
        eventLocation: body.event_location ?? null,
        functionType: body.function_type ?? null,
        guestCount: body.guest_count != null ? parseInt(body.guest_count, 10) : null,
        notes: body.notes ?? null,
        status: body.status ?? "PENDING",
        dishId: body.dish_id ?? null,
        parentDishId: body.parent_dish_id ?? null,
        isTemplate: body.is_template ?? null,
        eventSnapshot: body.event_snapshot ?? null,
        eventTotal:
          body.event_total != null ? new Prisma.Decimal(String(body.event_total)) : null,
      },
    });

    if (body.step_number != null) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          stepNumber: Math.min(5, Math.max(1, parseInt(body.step_number, 10) || 1)),
        },
      });
    }

    const updated = await loadBookingForBusiness(bookingId, businessId, {
      includePayments: true,
    });
    return successResponse(res, "Event created", serializeBooking(updated));
  } catch (e) {
    console.error("createEvent:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * DELETE /v1/bookings/:id/deleteEvent/:eventId — delete single event
 */
async function deleteEvent(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;
    const eventId = req.params.eventId;

    const existing = await loadBookingForBusiness(bookingId, businessId, {
      includePayments: true,
    });
    if (!existing) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (existing.status === "CANCELLED") {
      return errorResponse(res, "Cancelled booking cannot be updated", 200, "VALIDATION_ERROR");
    }
    if (existing.status !== "DRAFT") {
      return errorResponse(
        res,
        "Confirmed booking is locked for event/menu updates.",
        200,
        "VALIDATION_ERROR",
      );
    }

    const currentEvents = existing.events || [];
    const target = currentEvents.find((ev) => ev.id === eventId);
    if (!target) {
      return errorResponse(res, "Event not found", 404, "NOT_FOUND");
    }
    if (currentEvents.length <= 1) {
      return errorResponse(
        res,
        "Cannot delete the last event. Delete booking instead.",
        200,
        "VALIDATION_ERROR",
      );
    }

    await prisma.bookingEvent.delete({ where: { id: eventId } });

    const updated = await loadBookingForBusiness(bookingId, businessId, {
      includePayments: true,
    });
    return successResponse(res, "Event deleted", serializeBooking(updated));
  } catch (e) {
    console.error("deleteEvent:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/** Earliest event time for a booking, or legacy booking.eventAt (matches dashboard bucketing). */
function deriveBookingEventMs(b) {
  const evs = b.events || [];
  let best = NaN;
  for (const ev of evs) {
    if (!ev.eventAt) continue;
    const t = new Date(ev.eventAt).getTime();
    if (!Number.isNaN(t)) {
      if (Number.isNaN(best) || t < best) best = t;
    }
  }
  if (!Number.isNaN(best)) return best;
  if (b.eventAt) {
    const t = new Date(b.eventAt).getTime();
    return Number.isNaN(t) ? NaN : t;
  }
  return NaN;
}

/**
 * GET /v1/dashboard — home-tab aggregates for the mobile app.
 */
async function getDashboard(req, res) {
  try {
    const businessId = req.businessId;

    const [confirmedRows, draftCount] = await Promise.all([
      prisma.booking.findMany({
        where: { businessId, status: "CONFIRMED" },
        orderBy: { createdAt: "desc" },
        take: 500,
        include: {
          menuItems: true,
          events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
          payments: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      }),
      prisma.booking.count({ where: { businessId, status: "DRAFT" } }),
    ]);

    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(startToday);
    endToday.setDate(endToday.getDate() + 1);
    const endTwoDay = new Date(startToday);
    endTwoDay.setDate(endTwoDay.getDate() + 2);

    const paymentDueTotal = confirmedRows.reduce((sum, b) => {
      const outstanding = Math.max(0, num(b.totalDue) - num(b.amountPaid));
      return sum + outstanding;
    }, 0);

    const todayRaw = [];
    const twoDayRaw = [];
    const upcomingRaw = [];
    const completedRaw = [];
    const pendingManualCompletionRaw = [];

    for (const b of confirmedRows) {
      const t = deriveBookingEventMs(b);
      if (Number.isNaN(t)) continue;
      if (t >= startToday.getTime() && t < endToday.getTime()) {
        todayRaw.push({ b, t });
      }
      if (t >= startToday.getTime() && t < endTwoDay.getTime()) {
        twoDayRaw.push({ b, t });
      }
      if (t >= endToday.getTime()) {
        upcomingRaw.push({ b, t });
      }
      if (b.completedAt) {
        completedRaw.push({ b, t });
      }
      if (bookingNeedsPastDayManualCompleteFromRow(b, now)) {
        pendingManualCompletionRaw.push({ b, t });
      }
    }

    todayRaw.sort((a, b) => a.t - b.t);
    upcomingRaw.sort((a, b) => a.t - b.t);
    completedRaw.sort((a, b) => b.t - a.t);
    pendingManualCompletionRaw.sort((a, b) => a.t - b.t);

    const ordersToPrepare = twoDayRaw.filter(({ t }) => t >= now.getTime()).length;

    const payload = {
      today_event_count: todayRaw.length,
      two_day_event_count: twoDayRaw.length,
      draft_count: draftCount,
      payment_due_total: paymentDueTotal,
      orders_to_prepare_count: ordersToPrepare,
      today_timeline: todayRaw.map(({ b }) => serializeBooking(b)),
      upcoming_bookings: upcomingRaw.slice(0, 5).map(({ b }) => serializeBooking(b)),
      completed_orders: completedRaw.slice(0, 5).map(({ b }) => serializeBooking(b)),
      pending_manual_completion: pendingManualCompletionRaw
        .slice(0, 10)
        .map(({ b }) => serializeBooking(b)),
    };

    return successResponse(res, "OK", payload);
  } catch (e) {
    console.error("getDashboard:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * GET /v1/bookings
 */
async function listBookings(req, res) {
  try {
    const businessId = req.businessId;
    const {
      status,
      payment_status,
      event_from,
      event_to,
      created_from,
      created_to,
      completed_from,
      completed_to,
      manual_completed_only,
      limit,
      offset,
    } = req.query;

    const where = { businessId };
    if (status) {
      where.status = status;
    }
    if (payment_status) {
      where.paymentStatus = payment_status;
    }
    if (event_from || event_to) {
      where.eventAt = {};
      if (event_from) where.eventAt.gte = new Date(event_from);
      if (event_to) where.eventAt.lte = new Date(event_to);
    }
    if (created_from || created_to) {
      where.createdAt = {};
      if (created_from) where.createdAt.gte = new Date(created_from);
      if (created_to) where.createdAt.lte = new Date(created_to);
    }
    if (completed_from || completed_to) {
      where.completedAt = {};
      if (completed_from) where.completedAt.gte = new Date(completed_from);
      if (completed_to) where.completedAt.lte = new Date(completed_to);
    } else if (manual_completed_only === "true") {
      where.completedAt = { not: null };
    }

    const take = Math.min(200, parseInt(limit, 10) || 50);
    const skip = parseInt(offset, 10) || 0;

    const useCompletionSort =
      manual_completed_only === "true" || completed_from || completed_to;

    const [rows, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        orderBy: useCompletionSort
          ? [{ completedAt: "desc" }, { createdAt: "desc" }]
          : { createdAt: "desc" },
        take,
        skip,
        include: {
          menuItems: true,
          events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
          payments: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    return successResponse(res, "OK", {
      bookings: rows.map((b) => serializeBooking(b)),
      total,
    });
  } catch (e) {
    console.error("listBookings:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * GET /v1/bookings/:id
 */
async function getBooking(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;

    const row = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      include: {
        menuItems: true,
        events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!row) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    const enrichedRow = await enrichEventSnapshotMenuImages(row);
    return successResponse(res, "OK", serializeBooking(enrichedRow));
  } catch (e) {
    console.error("getBooking:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * POST /v1/bookings/:id/completeOrder — caterer marks booking completed (order history / dashboard).
 */
async function completeBookingOrder(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;

    const row = await loadBookingForBusiness(bookingId, businessId, {
      includePayments: true,
    });
    if (!row) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (row.completedAt) {
      const enriched = await enrichEventSnapshotMenuImages(row);
      return successResponse(res, "Already completed", serializeBooking(enriched));
    }
    if (row.status !== "CONFIRMED") {
      return errorResponse(
        res,
        "Only confirmed bookings can be marked complete",
        200,
        "VALIDATION_ERROR",
      );
    }
    const latestMs = bookingLatestEventMsFromRow(row);
    if (Number.isNaN(latestMs)) {
      return errorResponse(
        res,
        "Add at least one scheduled event before completing this order",
        200,
        "VALIDATION_ERROR",
      );
    }
    if (latestMs >= Date.now()) {
      return errorResponse(
        res,
        "You can complete this order only after the last event has finished",
        200,
        "VALIDATION_ERROR",
      );
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { completedAt: new Date() },
      include: {
        menuItems: true,
        events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });
    const enriched = await enrichEventSnapshotMenuImages(updated);
    return successResponse(res, "Order completed", serializeBooking(enriched));
  } catch (e) {
    console.error("completeBookingOrder:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * DELETE /v1/deleteBooking/:id
 * Deletes a draft booking for current business.
 */
async function deleteBooking(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;

    const existing = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true, status: true },
    });
    if (!existing) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (existing.status !== "DRAFT") {
      return errorResponse(
        res,
        "Only draft bookings can be deleted",
        200,
        "VALIDATION_ERROR",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.bookingMenuItem.deleteMany({ where: { bookingId } });
      await tx.paymentTransaction.deleteMany({ where: { bookingId } });
      await tx.booking.delete({ where: { id: bookingId } });
    });

    return successResponse(res, "Draft deleted", { id: bookingId });
  } catch (e) {
    console.error("deleteBooking:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * POST /v1/bookings/:id/confirm
 */
async function confirmBooking(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;

    const existing = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      include: {
        menuItems: true,
        events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!existing) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (existing.status !== "DRAFT") {
      return errorResponse(res, "Booking is not a draft", 200, "VALIDATION_ERROR");
    }

    const result = await prisma.$transaction(async (tx) => {
      let bookingCode = existing.bookingCode;
      if (!bookingCode) {
        bookingCode = await generateUniqueBookingCode(tx, businessId);
      }

      const menuRows = await tx.bookingMenuItem.findMany({ where: { bookingId } });
      const guests = existing.guestCount ?? 0;
      const pricing = computePricingFromSnapshots(
        menuRows,
        guests,
        num(existing.discountAmount),
        num(existing.serviceChargePct),
        num(existing.taxPct),
      );

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "CONFIRMED",
          bookingCode,
          subtotal: new Prisma.Decimal(String(pricing.subtotal)),
          serviceChargeAmount: new Prisma.Decimal(String(pricing.serviceChargeAmount)),
          taxAmount: new Prisma.Decimal(String(pricing.taxAmount)),
          totalDue: new Prisma.Decimal(String(pricing.totalDue)),
          paymentStatus: paymentStatusFromAmounts(existing.amountPaid, pricing.totalDue),
        },
        include: {
          menuItems: true,
          events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
          payments: { orderBy: { createdAt: "desc" } },
        },
      });
      return updated;
    });

    const emailTo = result.customerEmail;
    if (emailTo) {
      try {
        await sendBookingConfirmationEmail(emailTo, {
          bookingCode: result.bookingCode,
          eventAt: result.eventAt,
        });
      } catch (mailErr) {
        console.warn("confirmBooking email:", mailErr.message);
      }
    }

    return successResponse(res, "Booking confirmed", serializeBooking(result));
  } catch (e) {
    console.error("confirmBooking:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * POST /v1/bookigrecordPayment/:id
 */
async function recordPayment(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;
    const body = req.body || {};
    const amount = num(body.amount);
    const method = body.method;

    if (!method || !["CASH", "UPI", "BANK_TRANSFER"].includes(method)) {
      return errorResponse(res, "Invalid payment method", 200, "VALIDATION_ERROR");
    }
    if (amount <= 0) {
      return errorResponse(res, "Amount must be positive", 200, "VALIDATION_ERROR");
    }

    const existing = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      include: {
        events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!existing) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (existing.status !== "CONFIRMED") {
      return errorResponse(res, "Payments only for confirmed bookings", 200, "VALIDATION_ERROR");
    }

    const totalDue = resolveTotalDueForPayment(existing);
    const already = num(existing.amountPaid);
    const remaining = Math.max(0, totalDue - already);
    if (amount > remaining + 0.01) {
      return errorResponse(
        res,
        "Amount exceeds remaining balance",
        200,
        "VALIDATION_ERROR",
        `Maximum payable: ${remaining.toFixed(2)}`,
      );
    }

    const newPaid = already + amount;
    const payStatus = paymentStatusFromAmounts(newPaid, totalDue);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.create({
        data: {
          bookingId,
          amount: new Prisma.Decimal(String(amount)),
          method,
        },
      });
      return tx.booking.update({
        where: { id: bookingId },
        data: {
          amountPaid: new Prisma.Decimal(String(newPaid)),
          paymentStatus: payStatus,
        },
        include: {
          menuItems: true,
          events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
          payments: { orderBy: { createdAt: "desc" } },
        },
      });
    });

    return successResponse(res, "Payment recorded", serializeBooking(updated));
  } catch (e) {
    console.error("recordPayment:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * POST /v1/bookings/:id/pdf-jobs
 * Placeholder async trigger endpoint for non-blocking PDF pipeline.
 */
async function triggerBookingPdfJobs(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;
    const existing = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true },
    });
    if (!existing) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    // Current implementation intentionally returns accepted trigger response.
    return successResponse(res, "PDF jobs triggered", { ok: true });
  } catch (e) {
    console.error("triggerBookingPdfJobs:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * POST /v1/retryBookingPdfJob/:id/:jobId
 * Placeholder retry endpoint for PDF pipeline.
 */
async function retryBookingPdfJob(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;
    const jobId = req.params.jobId;
    const existing = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true },
    });
    if (!existing) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    return successResponse(res, "PDF job retry queued", { ok: true, job_id: jobId ?? null });
  } catch (e) {
    console.error("retryBookingPdfJob:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

module.exports = {
  createBooking,
  patchBooking,
  createEvent,
  updateEvent,
  deleteEvent,
  getDashboard,
  listBookings,
  getBooking,
  completeBookingOrder,
  deleteBooking,
  confirmBooking,
  recordPayment,
  triggerBookingPdfJobs,
  retryBookingPdfJob,
  computePricingFromSnapshots,
  canEditMenuBeforeEvent,
};
