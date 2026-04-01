const prisma = require("../config/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { successResponse, errorResponse } = require("../utils/response");
const { sendOtpEmail } = require("../utils/email");

const validatePassword = (password) => {
  const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
  return regex.test(password);
};

/** 1 if a non-empty fcm_token is provided, otherwise 0 */
function notificationStatusFromFcmToken(fcm_token) {
  return fcm_token != null && String(fcm_token).trim() !== "" ? 1 : 0;
}

async function upsertUserDevice(userId, deviceType, fcmToken) {
  if (deviceType === undefined) return;
  const existing = await prisma.userDevice.findFirst({
    where: { userId, deviceType },
  });
  if (existing) {
    await prisma.userDevice.update({
      where: { id: existing.id },
      data: { fcmToken: fcmToken ?? null },
    });
  } else {
    await prisma.userDevice.create({
      data: {
        userId,
        deviceType,
        fcmToken: fcmToken ?? null,
      },
    });
  }
}

function formatBusinessDetail(business) {
  const service_types = (business.serviceLinks || []).map(
    (l) => l.serviceType.slug,
  );
  return {
    id: business.id,
    business_logo: business.logoUrl,
    business_name: business.name,
    business_owner_name: business.ownerName,
    same_as_owner_number: business.sameAsOwnerNumber,
    contact_number: business.contactNumber,
    business_email: business.email ?? "",
    business_address: business.address,
    service_types,
    catering_types: business.cateringTypes || [],
    years_of_experience: business.yearsExperience,
    business_register_number: business.registrationNumber ?? "",
    gst_number: business.gstNumber ?? "",
    subscription: {
      status: business.subscriptionStatus ?? "trial",
      plan: business.subscriptionPlan ?? "FREE",
      start: business.subscriptionStart?.toISOString() ?? null,
      end: business.subscriptionEnd?.toISOString() ?? null,
    },
    is_trial_used: business.isTrialUsed,
  };
}

async function loadBusinessDetailsArray(businessId) {
  if (!businessId) return [];
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      serviceLinks: { include: { serviceType: true } },
    },
  });
  if (!business) return [];
  return [formatBusinessDetail(business)];
}

exports.signup = async (req, res) => {
  try {
    const {
      name,
      email,
      contact,
      password,
      device_type,
      fcm_token,
    } = req.body;

    if (
      !name ||
      !email ||
      !password ||
      !contact ||
      device_type === undefined
    ) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (!validatePassword(password)) {
      return errorResponse(
        res,
        "Password must be 8 characters, include 1 uppercase, 1 number and 1 special character",
        200,
        "VALIDATION_ERROR",
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return errorResponse(
        res,
        "User registration failed.",
        200,
        "USER_EXISTS",
        "Email already registered.",
      );
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    const notificationStatus = notificationStatusFromFcmToken(fcm_token);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashedPassword,
        phoneNumber: contact,
        businessId: null,
        notificationStatus,
      },
    });

    await upsertUserDevice(user.id, device_type, fcm_token);

    await prisma.otpCode.deleteMany({
      where: { email, type: "signup" },
    });

    const otp = Math.floor(100000 + 900000 * Math.random()).toString();

    await prisma.otpCode.create({
      data: {
        email,
        otp,
        type: "signup",
        expiresAt: new Date(Date.now() + 120 * 1000),
      },
    });

    sendOtpEmail(email, otp, "signup").catch((emailErr) => {
      console.error("Signup OTP email failed:", emailErr.message);
    });

    const token = jwt.sign(
      { userId: user.id, businessId: null },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const formattedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      contact: user.phoneNumber,
      profile_pic: null,
      status: user.isVerified ? 1 : 0,
      user_type: 1,
      notification_status: notificationStatus,
      email_verified_at: null,
      device_type,
      fcm_token: fcm_token || null,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      deleted_at: user.deletedAt,
    };

    return res.status(200).json({
      success: true,
      message: "User registered successfully.",
      data: {
        token,
        user: formattedUser,
      },
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    const existingOtp = await prisma.otpCode.findFirst({
      where: {
        email,
        type: "signup",
        isUsed: false,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!existingOtp) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    if (existingOtp.attempts >= 5) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    if (new Date() > existingOtp.expiresAt) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    if (existingOtp.otp !== otp) {
      await prisma.otpCode.update({
        where: { id: existingOtp.id },
        data: { attempts: existingOtp.attempts + 1 },
      });

      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    await prisma.otpCode.update({
      where: { id: existingOtp.id },
      data: { isUsed: true },
    });

    const verifiedAt = new Date();
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { isVerified: true, userVerifiedAt: verifiedAt },
    });

    const token = jwt.sign(
      { userId: updatedUser.id, businessId: updatedUser.businessId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const device = await prisma.userDevice.findFirst({
      where: { userId: updatedUser.id },
      orderBy: { createdAt: "desc" },
    });

    const formattedUser = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      contact: updatedUser.phoneNumber,
      profile_pic: null,
      status: 1,
      user_type: 1,
      notification_status: updatedUser.notificationStatus,
      user_verified_at: verifiedAt.toISOString(),
      device_type: device?.deviceType ?? null,
      fcm_token: device?.fcmToken ?? null,
      created_at: updatedUser.createdAt,
      updated_at: updatedUser.updatedAt,
      deleted_at: updatedUser.deletedAt,
    };

    return successResponse(
      res,
      "OTP verified successfully",
      {
        token,
        user: formattedUser,
      },
      200,
    );
  } catch (error) {
    console.error("Verify OTP error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.signIn = async (req, res) => {
  try {
    const { email, password, device_type, fcm_token } = req.body;

    if (!email || !password || device_type === undefined) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse(
        res,
        "Email or password is incorrect",
        200,
        "INVALID_CREDENTIALS",
      );
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return errorResponse(
        res,
        "Email or password is incorrect",
        200,
        "INVALID_CREDENTIALS",
      );
    }

    if (!user.isVerified) {
      await prisma.otpCode.deleteMany({
        where: { email, type: "signup" },
      });

      const otp = Math.floor(100000 + 900000 * Math.random()).toString();

      await prisma.otpCode.create({
        data: {
          email,
          otp,
          type: "signup",
          expiresAt: new Date(Date.now() + 120 * 1000),
        },
      });

      sendOtpEmail(email, otp, "signup").catch((emailErr) => {
        console.error("Login OTP email failed:", emailErr.message);
      });

      const token = jwt.sign(
        { userId: user.id, businessId: user.businessId },
        process.env.JWT_SECRET,
        { expiresIn: "7d" },
      );

      await upsertUserDevice(user.id, device_type, fcm_token);

      const notificationStatus = notificationStatusFromFcmToken(fcm_token);
      await prisma.user.update({
        where: { id: user.id },
        data: { notificationStatus },
      });

      const formattedUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        contact: user.phoneNumber,
        status: 1,
        notification_status: notificationStatus,
        user_verified_at: user.userVerifiedAt?.toISOString() ?? null,
        device_type,
        fcm_token: fcm_token || null,
        business_details: await loadBusinessDetailsArray(user.businessId),
        created_at: user.createdAt,
        updated_at: user.updatedAt,
        deleted_at: user.deletedAt,
      };

      return res.status(200).json({
        success: true,
        message: "Account not verified. OTP sent again.",
        data: {
          token,
          user: formattedUser,
        },
      });
    }

    await upsertUserDevice(user.id, device_type, fcm_token);

    const notificationStatus = notificationStatusFromFcmToken(fcm_token);
    await prisma.user.update({
      where: { id: user.id },
      data: { notificationStatus },
    });

    const token = jwt.sign(
      { userId: user.id, businessId: user.businessId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const business_details = await loadBusinessDetailsArray(user.businessId);

    const formattedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      contact: user.phoneNumber,
      status: 1,
      notification_status: notificationStatus,
      user_verified_at: user.userVerifiedAt?.toISOString() ?? null,
      device_type,
      fcm_token: fcm_token || null,
      business_details,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      deleted_at: user.deletedAt,
    };

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: formattedUser,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    await prisma.otpCode.deleteMany({
      where: { email, type: "signup" },
    });

    const otp = Math.floor(100000 + 900000 * Math.random()).toString();

    await prisma.otpCode.create({
      data: {
        email,
        otp,
        type: "signup",
        expiresAt: new Date(Date.now() + 120 * 1000),
      },
    });

    sendOtpEmail(email, otp, "signup").catch((emailErr) => {
      console.error("Resend OTP email failed:", emailErr.message);
    });

    return successResponse(res, "OTP resent successfully", null, 200);
  } catch (error) {
    console.error("Resend OTP error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    await prisma.otpCode.deleteMany({
      where: { email, type: "forgot" },
    });

    const otp = Math.floor(100000 + 900000 * Math.random()).toString();

    await prisma.otpCode.create({
      data: {
        email,
        otp,
        type: "forgot",
        expiresAt: new Date(Date.now() + 120 * 1000),
      },
    });

    sendOtpEmail(email, otp, "forgot").catch((emailErr) => {
      console.error("Forgot password email failed:", emailErr.message);
    });

    return successResponse(res, "OTP sent to email", null, 200);
  } catch (error) {
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.verifyForgotOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const existingOtp = await prisma.otpCode.findFirst({
      where: { email, type: "forgot", isUsed: false },
      orderBy: { createdAt: "desc" },
    });

    if (!existingOtp) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    if (new Date() > existingOtp.expiresAt) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    if (existingOtp.otp !== otp) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    await prisma.otpCode.update({
      where: { id: existingOtp.id },
      data: { isUsed: true },
    });

    return successResponse(res, "OTP verified", null, 200);
  } catch (error) {
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.resendForgotOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    await prisma.otpCode.deleteMany({
      where: {
        email,
        type: "forgot",
      },
    });

    const otp = Math.floor(100000 + 900000 * Math.random()).toString();

    await prisma.otpCode.create({
      data: {
        email,
        otp,
        type: "forgot",
        expiresAt: new Date(Date.now() + 120 * 1000),
      },
    });

    sendOtpEmail(email, otp, "forgot").catch((emailErr) => {
      console.error("Forgot password email failed:", emailErr.message);
    });

    return successResponse(res, "OTP resent successfully", null, 200);
  } catch (error) {
    console.error("Resend forgot OTP error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.newPassword = async (req, res) => {
  try {
    const { email, password, password_confirmation } = req.body;

    if (!email || !password || !password_confirmation) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (password !== password_confirmation) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (!validatePassword(password)) {
      return errorResponse(
        res,
        "Password must be 8 characters, include 1 uppercase, 1 number and 1 special character",
        200,
        "VALIDATION_ERROR",
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    await prisma.user.update({
      where: { email },
      data: { passwordHash: hashedPassword },
    });

    return successResponse(res, "Password reset successfully", null, 200);
  } catch (error) {
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token =
      authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return errorResponse(res, "Missing or invalid auth token", 401, "UNAUTHORIZED");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    if (!userId) {
      return errorResponse(res, "Missing or invalid auth token", 401, "UNAUTHORIZED");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    const businessId = user.businessId;

    await prisma.$transaction([
      prisma.otpCode.deleteMany({
        where: { email: user.email },
      }),
      prisma.userDevice.deleteMany({
        where: { userId },
      }),
      prisma.user.delete({
        where: { id: userId },
      }),
    ]);

    if (businessId) {
      const remainingUsers = await prisma.user.count({
        where: { businessId },
      });

      if (remainingUsers === 0) {
        await prisma.business.delete({ where: { id: businessId } });
      }
    }

    return successResponse(res, "User deleted successfully", null, 200);
  } catch (error) {
    console.error("Delete user error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.formatBusinessDetail = formatBusinessDetail;
