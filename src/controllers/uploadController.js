const crypto = require("crypto");
const supabase = require("../config/supabase");
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
 * @param {string} bucket - Supabase Storage bucket name
 */
function createBase64ImageHandler(bucket, logLabel) {
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

      const { error } = await supabase.storage
        .from(bucket)
        .upload(fileName, buffer, {
          contentType: mime,
          upsert: false,
        });

      if (error) {
        console.error(`${logLabel} supabase upload error:`, error.message);
        return errorResponse(res, "Failed to upload image", 500, "UPLOAD_ERROR");
      }

      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return successResponse(
        res,
        "Image uploaded successfully",
        { url: publicUrlData.publicUrl },
        200,
      );
    } catch (error) {
      console.error(`${logLabel} error:`, error.message);
      return errorResponse(res, "Server error", 500, "ERROR");
    }
  };
}

/**
 * POST /api/v1/upload-menu-image
 * Body: { base64: string, mime?: string }
 * Auth + business context required.
 */
exports.uploadMenuImage = createBase64ImageHandler("menu_item_image", "uploadMenuImage");

/**
 * POST /api/v1/upload-profile-image
 * Body: { base64: string, mime?: string }
 * Auth only — user profile photos.
 */
exports.uploadProfileImage = createBase64ImageHandler("profile_pictures", "uploadProfileImage");

/**
 * POST /api/v1/upload-business-image
 * Body: { base64: string, mime?: string }
 * Auth only — business profile pictures / logos.
 */
exports.uploadBusinessImage = createBase64ImageHandler("business_profile_pictures", "uploadBusinessImage");
