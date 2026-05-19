const crypto = require("crypto");
const supabase = require("../config/supabase");

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
 * Upload a base64 image to Supabase Storage.
 * @returns {Promise<{ ok: true, url: string } | { ok: false, message: string, code: string }>}
 */
async function uploadBase64ToBucket({ bucket, base64, mime: mimeRaw, logLabel }) {
  if (base64 == null || typeof base64 !== "string") {
    return { ok: false, message: "base64 image data is required", code: "VALIDATION_ERROR" };
  }

  const b64 = stripDataUrlBase64(base64);
  let mime =
    typeof mimeRaw === "string" ? mimeRaw.trim().toLowerCase() : "image/jpeg";
  if (!mime.startsWith("image/")) {
    mime = "image/jpeg";
  }

  const ext = ALLOWED_MIME.get(mime);
  if (!ext) {
    return {
      ok: false,
      message: "Only JPEG, PNG, or WebP images are allowed",
      code: "VALIDATION_ERROR",
    };
  }

  let buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, message: "Invalid base64 data", code: "VALIDATION_ERROR" };
  }

  if (!buffer.length) {
    return { ok: false, message: "Empty image data", code: "VALIDATION_ERROR" };
  }
  if (buffer.length > MAX_BYTES) {
    return { ok: false, message: "Image must be 5MB or smaller", code: "VALIDATION_ERROR" };
  }

  const fileName = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(fileName, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (error) {
    console.error(`${logLabel} supabase upload error:`, error.message);
    return { ok: false, message: "Failed to upload image", code: "UPLOAD_ERROR" };
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return { ok: true, url: publicUrlData.publicUrl };
}

module.exports = {
  uploadBase64ToBucket,
  stripDataUrlBase64,
};
