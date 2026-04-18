const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/contact-us
 * Body: { email, customer_name, phone, description }
 * Auth: required (JWT)
 */
exports.submitContact = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { email, customer_name, phone, description } = req.body;

    const emailTrim = typeof email === "string" ? email.trim() : "";
    const nameTrim =
      typeof customer_name === "string" ? customer_name.trim() : "";
    const phoneDigits =
      typeof phone === "string" ? phone.replace(/\D/g, "").slice(0, 10) : "";
    const descTrim =
      typeof description === "string" ? description.trim() : "";

    if (!emailTrim || !nameTrim || !phoneDigits || !descTrim) {
      return errorResponse(
        res,
        "Email, name, phone, and description are required",
        422,
        "VALIDATION_ERROR",
      );
    }
    if (phoneDigits.length !== 10) {
      return errorResponse(
        res,
        "Enter a valid 10-digit phone number",
        422,
        "VALIDATION_ERROR",
      );
    }
    if (!EMAIL_RE.test(emailTrim)) {
      return errorResponse(res, "Invalid email address", 422, "VALIDATION_ERROR");
    }
    if (nameTrim.length < 2) {
      return errorResponse(
        res,
        "Name must be at least 2 characters",
        422,
        "VALIDATION_ERROR",
      );
    }
    if (descTrim.length < 10) {
      return errorResponse(
        res,
        "Description must be at least 10 characters",
        422,
        "VALIDATION_ERROR",
      );
    }

    await prisma.contactMessage.create({
      data: {
        email: emailTrim,
        customerName: nameTrim,
        phone: phoneDigits,
        description: descTrim,
        userId: userId ?? null,
      },
    });

    return successResponse(
      res,
      "Your message has been sent. We'll get back to you soon.",
      null,
      200,
    );
  } catch (error) {
    console.error("submitContact:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
