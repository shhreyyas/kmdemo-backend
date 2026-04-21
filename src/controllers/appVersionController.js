const { successResponse, errorResponse } = require("../utils/response");

/**
 * GET /api/app-latest-version?platform=ios|android&app_version=1.0.0
 * Public — no auth required.
 *
 * Returns whether the caller should force-update, optionally update, or is up-to-date.
 * Version config is kept in env vars so it can be changed without a deploy via
 * Render / Railway / Heroku dashboard.
 *
 * Env vars (set on the server):
 *   APP_LATEST_VERSION          – e.g. "1.2.0"
 *   APP_MINIMUM_VERSION         – e.g. "1.0.0"  (anything below → force update)
 *   APP_UPDATE_MESSAGE          – optional custom message
 *   APP_IOS_LATEST_VERSION      – per-platform override (optional)
 *   APP_IOS_MINIMUM_VERSION     – per-platform override (optional)
 *   APP_ANDROID_LATEST_VERSION  – per-platform override (optional)
 *   APP_ANDROID_MINIMUM_VERSION – per-platform override (optional)
 */
exports.getLatestVersion = async (req, res) => {
  try {
    const platform = req.query.platform;
    const appVersion = req.query.app_version;

    if (!platform || !appVersion) {
      return errorResponse(
        res,
        "platform and app_version query params are required",
        422,
        "VALIDATION_ERROR",
      );
    }

    const isIos = platform === "ios";

    // Resolve per-platform or global config
    const latestVersion = isIos
      ? process.env.APP_IOS_LATEST_VERSION || process.env.APP_LATEST_VERSION || "1.0.0"
      : process.env.APP_ANDROID_LATEST_VERSION || process.env.APP_LATEST_VERSION || "1.0.0";

    const minimumVersion = isIos
      ? process.env.APP_IOS_MINIMUM_VERSION || process.env.APP_MINIMUM_VERSION || "1.0.0"
      : process.env.APP_ANDROID_MINIMUM_VERSION || process.env.APP_MINIMUM_VERSION || "1.0.0";

    const updateMessage =
      process.env.APP_UPDATE_MESSAGE ||
      "A new version of the app is available. Please update to the latest version for the best experience.";

    const forceUpdate = compareVersions(appVersion, minimumVersion) < 0;
    const optionalUpdate =
      !forceUpdate && compareVersions(appVersion, latestVersion) < 0;

    return successResponse(res, "Version info", {
      latest_version: latestVersion,
      minimum_version: minimumVersion,
      force_update: forceUpdate,
      optional_update: optionalUpdate,
      version_update_message: updateMessage,
    });
  } catch (error) {
    console.error("getLatestVersion:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/**
 * Compare two semver strings (major.minor.patch).
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}
