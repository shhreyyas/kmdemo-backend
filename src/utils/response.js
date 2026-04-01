exports.successResponse = (res, message, data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
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
