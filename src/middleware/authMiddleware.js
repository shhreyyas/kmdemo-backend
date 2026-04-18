const jwt = require("jsonwebtoken");
const { errorResponse } = require("../utils/response");

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return errorResponse(res, "Missing or invalid auth token", 401, "UNAUTHORIZED");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return errorResponse(res, "Missing or invalid auth token", 401, "UNAUTHORIZED");
  }
};
