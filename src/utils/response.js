exports.successResponse = (res, message, data = null, statusCode = 200, extras = undefined) => {
  const body = { success: true, message, data };
  if (extras != null && typeof extras === "object") {
    Object.assign(body, extras);
  }
  return res.status(statusCode).json(body);
};

exports.errorResponse = (
  res,
  message,
  statusCode = 200,
  errorCode = "ERROR",
  detailMessage,
) => {
  const errMsg = detailMessage !== undefined ? detailMessage : message;
  return res.status(statusCode).json({
    success: false,
    message,
    error: {
      code: errorCode,
      message: errMsg,
    },
  });
};
