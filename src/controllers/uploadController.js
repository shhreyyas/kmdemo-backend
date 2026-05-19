const { successResponse, errorResponse } = require("../utils/response");
const { uploadBase64ToBucket } = require("../utils/uploadBase64Image");

/**
 * @param {string} bucket - Supabase Storage bucket name
 */
function createBase64ImageHandler(bucket, logLabel) {
  return async (req, res) => {
    try {
      const { base64, mime: mimeRaw } = req.body;
      const result = await uploadBase64ToBucket({
        bucket,
        base64,
        mime: mimeRaw,
        logLabel,
      });

      if (!result.ok) {
        const status = result.code === "UPLOAD_ERROR" ? 500 : 422;
        return errorResponse(res, result.message, status, result.code);
      }

      return successResponse(
        res,
        "Image uploaded successfully",
        { url: result.url },
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
