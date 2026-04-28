const prisma = require("../config/prisma");
const jwt = require("jsonwebtoken");
const { successResponse, errorResponse } = require("../utils/response");
const { formatBusinessDetail } = require("./authController");

const TRIAL_DAYS = 30;

const ALLOWED_CATERING = new Set(["veg", "non_veg"]);
const SUPPORTED_SERVICE_TYPE_LANGS = new Set(["en", "hi", "gu"]);

function normalizeLanguageCode(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "en";
  const base = raw.trim().toLowerCase().split(",")[0].split(";")[0].replace("_", "-");
  const primary = base.split("-")[0];
  return SUPPORTED_SERVICE_TYPE_LANGS.has(primary) ? primary : "en";
}

function getRequestedLanguage(req) {
  return normalizeLanguageCode(
    req.headers["x-language"] || req.headers["accept-language"] || "en",
  );
}

function normalizeLocalizedName(input) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed ? { en: trimmed } : null;
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const out = {};
  for (const [rawLang, rawValue] of Object.entries(input)) {
    const lang = normalizeLanguageCode(rawLang);
    if (!SUPPORTED_SERVICE_TYPE_LANGS.has(lang)) continue;
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (value) out[lang] = value;
  }

  const keys = Object.keys(out);
  if (keys.length === 0) return null;
  if (!out.en) out.en = out[keys[0]];
  return out;
}

function resolveLocalizedName(nameValue, language) {
  if (typeof nameValue === "string") return nameValue;
  if (!nameValue || typeof nameValue !== "object" || Array.isArray(nameValue)) {
    return "";
  }

  if (typeof nameValue[language] === "string" && nameValue[language].trim()) {
    return nameValue[language].trim();
  }
  if (typeof nameValue.en === "string" && nameValue.en.trim()) {
    return nameValue.en.trim();
  }

  for (const value of Object.values(nameValue)) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * POST /api/v1/createServiceTypes
 * Body: { names: ["Live Counter", "Outdoor Catering"] }
 * Auth: required
 * Creates service types that don't already exist and returns all of them.
 */
exports.createServiceTypes = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const { names, items } = req.body;

    const rawItems = Array.isArray(items) && items.length > 0
      ? items
      : Array.isArray(names)
        ? names
        : [];

    if (rawItems.length === 0) {
      return errorResponse(
        res,
        "items or names array is required",
        200,
        "VALIDATION_ERROR",
      );
    }

    const normalizedItems = rawItems
      .map((entry) => {
        if (typeof entry === "string") {
          return { name: normalizeLocalizedName(entry) };
        }
        const localized = normalizeLocalizedName(entry?.name);
        if (!localized) return null;

        return {
          name: localized,
          slug:
            typeof entry.slug === "string" && entry.slug.trim()
              ? entry.slug.trim()
              : undefined,
          icon:
            typeof entry.icon === "string" && entry.icon.trim()
              ? entry.icon.trim()
              : null,
          status: Number(entry.status) === 0 ? 0 : 1,
        };
      })
      .filter(Boolean);

    if (normalizedItems.length === 0) {
      return errorResponse(
        res,
        "At least one non-empty name is required",
        200,
        "VALIDATION_ERROR",
      );
    }

    const results = [];

    for (const item of normalizedItems) {
      const slugSource = item.slug || item.name.en;
      let slug = slugSource.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (!slug) slug = `custom-${Date.now()}`;

      // Use upsert to avoid unique constraint race conditions
      const row = await prisma.serviceType.upsert({
        where: { slug },
        update: {},              // already exists — do nothing
        create: {
          name: item.name,
          slug,
          icon: item.icon,
          status: item.status,
        },
      });

      results.push({
        id: row.id,
        name: resolveLocalizedName(row.name, requestedLanguage),
        slug: row.slug,
        icon: row.icon,
        status: row.status,
      });
    }

    return successResponse(res, "Service types added successfully", results, 201);
  } catch (error) {
    console.error("createServiceTypes error:", error.message, error.stack);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.listServiceTypes = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const rows = await prisma.serviceType.findMany({
      where: { status: 1 },
      orderBy: { id: "asc" },
    });

    const data = rows.map((r) => ({
      id: r.id,
      name: resolveLocalizedName(r.name, requestedLanguage),
      slug: r.slug,
      icon: r.icon,
      status: r.status,
    }));

    return successResponse(res, "Service types fetched successfully", data, 200);
  } catch (error) {
    console.error("listServiceTypes error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.registerBusiness = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      business_logo,
      business_name,
      business_owner_name,
      same_as_owner_number,
      contact_number,
      business_email,
      business_address,
      service_types,
      catering_types,
      years_of_experience,
      business_register_number,
      gst_number,
    } = req.body;

    const yoe = years_of_experience !== undefined ? Number(years_of_experience) : 0;
    if (
      !business_name ||
      !business_address ||
      !contact_number
    ) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        devices: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    let resolvedContact;
    if (same_as_owner_number === true) {
      if (!user.phoneNumber) {
        return errorResponse(
          res,
          "One or more required fields are missing or malformed",
          200,
          "VALIDATION_ERROR",
          "User has no contact number to use when same_as_owner_number is true.",
        );
      }
      resolvedContact = user.phoneNumber;
    } else {
      resolvedContact = contact_number;
    }

    if (!resolvedContact) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (Array.isArray(catering_types)) {
      for (const ct of catering_types) {
        if (!ALLOWED_CATERING.has(ct)) {
          return errorResponse(
            res,
            "One or more required fields are missing or malformed",
            200,
            "VALIDATION_ERROR",
            "catering_types must only include veg and non_veg.",
          );
        }
      }
    }

    if (user.businessId) {
      return errorResponse(
        res,
        "Business already registered for this user",
        200,
        "VALIDATION_ERROR",
      );
    }

    let existingSlugs = [];
    if (Array.isArray(service_types) && service_types.length > 0) {
      const uniqueSlugs = [...new Set(service_types)];
      existingSlugs = await prisma.serviceType.findMany({
        where: { slug: { in: uniqueSlugs }, status: 1 },
      });

      if (existingSlugs.length !== uniqueSlugs.length) {
        return errorResponse(
          res,
          "One or more required fields are missing or malformed",
          200,
          "VALIDATION_ERROR",
          "Invalid service_types slug(s). Use values from GET /v1/getservicetypes.",
        );
      }
    }

    const now = new Date();
    const subscriptionEnd = new Date(now);
    subscriptionEnd.setDate(subscriptionEnd.getDate() + TRIAL_DAYS);

    const business = await prisma.$transaction(async (tx) => {
      const b = await tx.business.create({
        data: {
          logoUrl: business_logo ?? null,
          name: business_name,
          ownerName: business_owner_name ?? "",
          sameAsOwnerNumber: Boolean(same_as_owner_number),
          contactNumber: resolvedContact,
          email: business_email ?? "",
          address: business_address,
          cateringTypes: Array.isArray(catering_types) ? catering_types : [],
          yearsExperience: Number.isFinite(yoe) ? yoe : 0,
          registrationNumber: business_register_number ?? "",
          gstNumber: gst_number ?? "",
          subscriptionStatus: "trial",
          subscriptionPlan: "FREE",
          subscriptionStart: now,
          subscriptionEnd,
          isTrialUsed: false,
          createdByUserId: userId,
          isProfileCompleted: true,
        },
      });

      for (const st of existingSlugs) {
        await tx.businessServiceType.create({
          data: {
            businessId: b.id,
            serviceTypeId: st.id,
          },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: { businessId: b.id },
      });

      return b;
    });

    const fullBusiness = await prisma.business.findUnique({
      where: { id: business.id },
      include: {
        serviceLinks: { include: { serviceType: true } },
      },
    });

    const token = jwt.sign(
      { userId, businessId: business.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const device = user.devices[0];
    const business_details = fullBusiness
      ? [formatBusinessDetail(fullBusiness)]
      : [];

    const refreshed = await prisma.user.findUnique({
      where: { id: userId },
    });

    const formattedUser = {
      id: refreshed.id,
      name: refreshed.name,
      email: refreshed.email,
      contact: refreshed.phoneNumber,
      profile_pic: refreshed.profileImageUrl ?? null,
      status: 1,
      notification_status: refreshed.notificationStatus,
      user_verified_at: refreshed.userVerifiedAt?.toISOString() ?? null,
      device_type: device?.deviceType ?? null,
      fcm_token: device?.fcmToken ?? null,
      business_details,
      created_at: refreshed.createdAt,
      updated_at: refreshed.updatedAt,
      deleted_at: refreshed.deletedAt,
    };

    return successResponse(
      res,
      "Business registered successfully",
      {
        token,
        user: formattedUser,
      },
      201,
    );
  } catch (error) {
    console.error("registerBusiness error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.updateBusiness = async (req, res) => {
  try {
    const userId = req.user.userId;
    const businessId = req.businessId;

    if (!businessId) {
      return errorResponse(
        res,
        "No business context. Register a business first.",
        400,
        "NO_BUSINESS",
      );
    }

    const {
      business_logo,
      gst_number,
      business_address,
      contact_number,
      business_email,
    } = req.body;

    const data = {};
    if (business_logo !== undefined) {
      const v = String(business_logo).trim();
      data.logoUrl = v || null;
    }
    if (gst_number !== undefined) {
      data.gstNumber = String(gst_number).trim() || "";
    }
    if (business_address !== undefined) {
      data.address = String(business_address).trim() || null;
    }
    if (contact_number !== undefined) {
      const digits = String(contact_number).replace(/\D/g, "").slice(0, 10);
      data.contactNumber = digits || null;
    }
    if (business_email !== undefined) {
      data.email = String(business_email).trim() || "";
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(
        res,
        "No fields to update",
        200,
        "VALIDATION_ERROR",
      );
    }

    await prisma.business.update({
      where: { id: businessId },
      data,
    });

    const fullBusiness = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        serviceLinks: { include: { serviceType: true } },
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        devices: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!user || !fullBusiness) {
      return errorResponse(res, "Not found", 404, "NOT_FOUND");
    }

    const token = jwt.sign(
      { userId, businessId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const device = user.devices[0];
    const business_details = [formatBusinessDetail(fullBusiness)];

    const formattedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      contact: user.phoneNumber,
      profile_pic: user.profileImageUrl ?? null,
      status: 1,
      notification_status: user.notificationStatus,
      user_verified_at: user.userVerifiedAt?.toISOString() ?? null,
      device_type: device?.deviceType ?? null,
      fcm_token: device?.fcmToken ?? null,
      business_details,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      deleted_at: user.deletedAt,
    };

    return successResponse(
      res,
      "Business profile updated successfully",
      {
        token,
        user: formattedUser,
      },
      200,
    );
  } catch (error) {
    console.error("updateBusiness error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/**
 * DELETE /api/v1/deleteBusiness
 * Auth + business context required.
 * Fully removes the business and all related data (cascade).
 * Unlinks all users from the business first.
 */
exports.deleteBusiness = async (req, res) => {
  try {
    const userId = req.user.userId;
    const businessId = req.businessId;

    if (!businessId) {
      return errorResponse(
        res,
        "No business context. Register a business first.",
        400,
        "NO_BUSINESS",
      );
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return errorResponse(res, "Business not found", 404, "NOT_FOUND");
    }

    if (business.createdByUserId !== userId) {
      return errorResponse(
        res,
        "Only the business owner can delete this business",
        403,
        "FORBIDDEN",
      );
    }

    await prisma.$transaction(async (tx) => {
      // Unlink all users from this business
      await tx.user.updateMany({
        where: { businessId },
        data: { businessId: null },
      });

      // Delete booking menu items and quotation menu items first
      // (they have onDelete: Restrict on menuItemId, blocking cascade)
      const menuItemIds = (
        await tx.menuItem.findMany({
          where: { businessId },
          select: { id: true },
        })
      ).map((m) => m.id);

      if (menuItemIds.length > 0) {
        await tx.bookingMenuItem.deleteMany({
          where: { menuItemId: { in: menuItemIds } },
        });
        await tx.quotationMenuItem.deleteMany({
          where: { menuItemId: { in: menuItemIds } },
        });
      }

      // Delete the business (cascades to service links, menu items, bookings, quotations, billing)
      await tx.business.delete({
        where: { id: businessId },
      });
    });

    return successResponse(
      res,
      "Business deleted successfully",
      null,
      200,
    );
  } catch (error) {
    console.error("deleteBusiness error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
