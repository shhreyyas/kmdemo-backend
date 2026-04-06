const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { successResponse, errorResponse } = require("../utils/response");

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function stripDataUrlBase64(raw) {
  if (typeof raw !== "string") return raw;
  const m = /^data:image\/[\w+.-]+;base64,(.+)$/i.exec(raw.trim());
  return m ? m[1] : raw.trim();
}

/**
 * @param {string} subdir - folder under `uploads/` (e.g. `menu`, `profile`)
 */
function createBase64ImageHandler(subdir, logLabel) {
  return async (req, res) => {
    try {
      const { base64, mime: mimeRaw } = req.body;
      if (base64 == null || typeof base64 !== "string") {
        return errorResponse(
          res,
          "base64 image data is required",
          422,
          "VALIDATION_ERROR",
        );
      }

      const b64 = stripDataUrlBase64(base64);
      let mime =
        typeof mimeRaw === "string" ? mimeRaw.trim().toLowerCase() : "image/jpeg";
      if (!mime.startsWith("image/")) {
        mime = "image/jpeg";
      }

      const ext = ALLOWED_MIME.get(mime);
      if (!ext) {
        return errorResponse(
          res,
          "Only JPEG, PNG, or WebP images are allowed",
          422,
          "VALIDATION_ERROR",
        );
      }

      let buffer;
      try {
        buffer = Buffer.from(b64, "base64");
      } catch {
        return errorResponse(res, "Invalid base64 data", 422, "VALIDATION_ERROR");
      }

      if (!buffer.length) {
        return errorResponse(res, "Empty image data", 422, "VALIDATION_ERROR");
      }
      if (buffer.length > MAX_BYTES) {
        return errorResponse(res, "Image must be 5MB or smaller", 422, "VALIDATION_ERROR");
      }

      const fileName = `${crypto.randomUUID()}.${ext}`;
      const uploadDir = path.join(__dirname, "..", "..", "uploads", subdir);
      await fs.mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, fileName);
      await fs.writeFile(filePath, buffer);

      const publicBase =
        process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
        `${req.protocol}://${req.get("host")}`;
      const url = `${publicBase}/uploads/${subdir}/${fileName}`;

      return successResponse(res, "Image uploaded successfully", { url }, 200);
    } catch (error) {
      console.error(`${logLabel} error:`, error.message);
      return errorResponse(res, "Server error", 500, "ERROR");
    }
  };
}

/**
 * POST /api/v1/upload-menu-image
 * Body: { base64: string, mime?: string }
 * Auth + business context required (same as menu routes).
 */
exports.uploadMenuImage = createBase64ImageHandler("menu", "uploadMenuImage");

/**
 * POST /api/v1/upload-profile-image
 * Body: { base64: string, mime?: string }
 * Auth only — user profile photos do not require a business.
 */
exports.uploadProfileImage = createBase64ImageHandler("profile", "uploadProfileImage");
