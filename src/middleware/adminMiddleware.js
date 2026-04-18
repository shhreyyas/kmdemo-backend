const prisma = require("../config/prisma");
const { errorResponse } = require("../utils/response");

/**
 * Must run after authMiddleware. Verifies the user exists and has role `admin` (DB check).
 */
module.exports = async (req, res, next) => {
  const userId = req.user?.userId;
  if (!userId) {
    return errorResponse(res, "Missing or invalid auth token", 401, "UNAUTHORIZED");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || user.role !== "admin") {
      return errorResponse(res, "Admin access required", 403, "FORBIDDEN");
    }

    next();
  } catch (err) {
    console.error("adminMiddleware error:", err.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
