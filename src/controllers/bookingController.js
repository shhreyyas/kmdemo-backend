const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const { successResponse, errorResponse } = require("../utils/response");
const { sendBookingConfirmationEmail } = require("../utils/email");

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

function canEditMenuBeforeEvent(eventAt) {
  if (!eventAt) return true;
  const eventDay = new Date(eventAt);
  eventDay.setHours(0, 0, 0, 0);
  const cutoff = new Date(eventDay.getTime());
  cutoff.setDate(cutoff.getDate() - 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime() < cutoff.getTime();
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

  return {
    id: b.id,
    business_id: b.businessId,
    status: b.status,
    step_number: b.stepNumber,
    booking_code: b.bookingCode,
    customer_name: b.customerName,
    customer_phone: b.customerPhone,
    customer_email: b.customerEmail,
    event_at: b.eventAt?.toISOString?.() ?? b.eventAt,
    event_location: b.eventLocation,
    function_type: b.functionType,
    guest_count: b.guestCount,
    notes: b.notes,
    discount_amount: num(b.discountAmount),
    service_charge_pct: num(b.serviceChargePct),
    tax_pct: num(b.taxPct),
    subtotal: num(b.subtotal),
    service_charge_amount: num(b.serviceChargeAmount),
    tax_amount: num(b.taxAmount),
    total_due: num(b.totalDue),
    amount_paid: num(b.amountPaid),
    payment_status: b.paymentStatus,
    menu_items: menuItems,
    ...(payments !== undefined ? { payments } : {}),
    can_edit_menu: canEditMenuBeforeEvent(b.eventAt),
    created_at: b.createdAt?.toISOString?.() ?? b.createdAt,
    updated_at: b.updatedAt?.toISOString?.() ?? b.updatedAt,
  };
}

async function loadBookingForBusiness(bookingId, businessId, extras = {}) {
  return prisma.booking.findFirst({
    where: { id: bookingId, businessId },
    include: {
      menuItems: true,
      ...(extras.includePayments
        ? { payments: { orderBy: { createdAt: "desc" } } }
        : {}),
    },
  });
}

/**
 * POST /v1/bookings — create draft
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

    const sc = num(body.service_charge_pct ?? business.defaultServiceChargePct);
    const txp = num(body.tax_pct ?? business.defaultTaxPct);
    const pricing = computePricingFromSnapshots(
      [],
      body.guest_count ?? 0,
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
        eventAt: body.event_at ? new Date(body.event_at) : null,
        eventLocation: body.event_location ?? null,
        functionType: body.function_type ?? null,
        guestCount: body.guest_count != null ? parseInt(body.guest_count, 10) : null,
        notes: body.notes ?? null,
        discountAmount: new Prisma.Decimal(String(body.discount_amount ?? 0)),
        serviceChargePct: new Prisma.Decimal(String(sc)),
        taxPct: new Prisma.Decimal(String(txp)),
        subtotal: new Prisma.Decimal(String(pricing.subtotal)),
        serviceChargeAmount: new Prisma.Decimal(String(pricing.serviceChargeAmount)),
        taxAmount: new Prisma.Decimal(String(pricing.taxAmount)),
        totalDue: new Prisma.Decimal(String(pricing.totalDue)),
      },
    });

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
      return errorResponse(res, "Cancelled booking cannot be updated", 422, "VALIDATION_ERROR");
    }

    const isDraft = existing.status === "DRAFT";
    const menuItemIds = Array.isArray(body.menu_item_ids) ? body.menu_item_ids : null;
    const menuLines = Array.isArray(body.menu_items) ? body.menu_items : null;

    if (menuItemIds != null || menuLines != null) {
      if (!isDraft && !canEditMenuBeforeEvent(existing.eventAt)) {
        return errorResponse(
          res,
          "Menu can no longer be edited for this event date",
          422,
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
        return errorResponse(res, "One or more menu items not found", 422, "VALIDATION_ERROR");
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
          nameSnapshot: m.name,
          imageUrlSnapshot: m.imageUrl,
        };
      });
      if (createRows.length) {
        await prisma.bookingMenuItem.createMany({ data: createRows });
      }
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
        422,
        "VALIDATION_ERROR",
      );
    }

    const baseData = {
      customerName: body.customer_name !== undefined ? body.customer_name : existing.customerName,
      customerPhone: body.customer_phone !== undefined ? body.customer_phone : existing.customerPhone,
      customerEmail: body.customer_email !== undefined ? body.customer_email : existing.customerEmail,
      eventAt:
        body.event_at !== undefined ? (body.event_at ? new Date(body.event_at) : null) : existing.eventAt,
      eventLocation: body.event_location !== undefined ? body.event_location : existing.eventLocation,
      functionType: body.function_type !== undefined ? body.function_type : existing.functionType,
      guestCount: body.guest_count != null ? parseInt(body.guest_count, 10) : existing.guestCount,
      notes: body.notes !== undefined ? body.notes : existing.notes,
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
      include: { menuItems: true, payments: { orderBy: { createdAt: "desc" } } },
    });

    return successResponse(res, "Booking updated", serializeBooking(updated));
  } catch (e) {
    console.error("patchBooking:", e);
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

    const take = Math.min(200, parseInt(limit, 10) || 50);
    const skip = parseInt(offset, 10) || 0;

    const [rows, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        include: {
          menuItems: true,
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
        payments: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!row) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    return successResponse(res, "OK", serializeBooking(row));
  } catch (e) {
    console.error("getBooking:", e);
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
      include: { menuItems: true },
    });
    if (!existing) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (existing.status !== "DRAFT") {
      return errorResponse(res, "Booking is not a draft", 422, "VALIDATION_ERROR");
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
        include: { menuItems: true, payments: { orderBy: { createdAt: "desc" } } },
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
 * POST /v1/bookings/:id/payments
 */
async function recordPayment(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.id;
    const body = req.body || {};
    const amount = num(body.amount);
    const method = body.method;

    if (!method || !["CASH", "UPI", "BANK_TRANSFER"].includes(method)) {
      return errorResponse(res, "Invalid payment method", 422, "VALIDATION_ERROR");
    }
    if (amount <= 0) {
      return errorResponse(res, "Amount must be positive", 422, "VALIDATION_ERROR");
    }

    const existing = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
    });
    if (!existing) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (existing.status !== "CONFIRMED") {
      return errorResponse(res, "Payments only for confirmed bookings", 422, "VALIDATION_ERROR");
    }

    const totalDue = num(existing.totalDue);
    const already = num(existing.amountPaid);
    const remaining = Math.max(0, totalDue - already);
    if (amount > remaining + 0.01) {
      return errorResponse(
        res,
        "Amount exceeds remaining balance",
        422,
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

module.exports = {
  createBooking,
  patchBooking,
  listBookings,
  getBooking,
  confirmBooking,
  recordPayment,
  computePricingFromSnapshots,
  canEditMenuBeforeEvent,
};
