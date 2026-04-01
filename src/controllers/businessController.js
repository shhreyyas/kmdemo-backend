const prisma = require("../config/prisma");
const jwt = require("jsonwebtoken");
const { successResponse, errorResponse } = require("../utils/response");
const { formatBusinessDetail } = require("./authController");

const TRIAL_DAYS = 30;

const ALLOWED_CATERING = new Set(["veg", "non_veg"]);

exports.listServiceTypes = async (req, res) => {
  try {
    const rows = await prisma.serviceType.findMany({
      where: { status: 1 },
      orderBy: { id: "asc" },
    });

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
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

    const yoe = Number(years_of_experience);
    if (
      !business_logo ||
      !business_name ||
      !business_owner_name ||
      !business_address ||
      years_of_experience === undefined ||
      !Number.isFinite(yoe) ||
      !Number.isInteger(yoe) ||
      yoe < 0 ||
      !Array.isArray(service_types) ||
      service_types.length === 0 ||
      !Array.isArray(catering_types) ||
      catering_types.length === 0
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

    if (user.businessId) {
      return errorResponse(
        res,
        "Business already registered for this user",
        200,
        "VALIDATION_ERROR",
      );
    }

    const uniqueSlugs = [...new Set(service_types)];
    const existingSlugs = await prisma.serviceType.findMany({
      where: { slug: { in: uniqueSlugs }, status: 1 },
    });

    if (existingSlugs.length !== uniqueSlugs.length) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
        "Invalid service_types slug(s). Use values from GET /service-types.",
      );
    }

    const now = new Date();
    const subscriptionEnd = new Date(now);
    subscriptionEnd.setDate(subscriptionEnd.getDate() + TRIAL_DAYS);

    const business = await prisma.$transaction(async (tx) => {
      const b = await tx.business.create({
        data: {
          logoUrl: business_logo,
          name: business_name,
          ownerName: business_owner_name,
          sameAsOwnerNumber: Boolean(same_as_owner_number),
          contactNumber: resolvedContact,
          email: business_email ?? "",
          address: business_address,
          cateringTypes: catering_types,
          yearsExperience: yoe,
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
      { userId, businessId: business.id },
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
