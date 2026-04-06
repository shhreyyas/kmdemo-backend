const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const businessContextMiddleware = require("../middleware/businessContextMiddleware");
const {
  createBooking,
  patchBooking,
  listBookings,
  getBooking,
  confirmBooking,
  recordPayment,
} = require("../controllers/bookingController");

router.post("/v1/bookings", authMiddleware, businessContextMiddleware, createBooking);
router.patch("/v1/bookings/:id", authMiddleware, businessContextMiddleware, patchBooking);
router.get("/v1/bookings", authMiddleware, businessContextMiddleware, listBookings);
router.get("/v1/bookings/:id", authMiddleware, businessContextMiddleware, getBooking);
router.post(
  "/v1/bookings/:id/confirm",
  authMiddleware,
  businessContextMiddleware,
  confirmBooking,
);
router.post(
  "/v1/bookings/:id/payments",
  authMiddleware,
  businessContextMiddleware,
  recordPayment,
);

module.exports = router;
