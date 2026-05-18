const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const businessContextMiddleware = require("../middleware/businessContextMiddleware");
const {
  listExtraServices,
  createExtraService,
  updateExtraService,
  deleteExtraService,
  setBookingExtraServices,
} = require("../controllers/extraServiceController");

router.get(
  "/v1/extra-services",
  authMiddleware,
  businessContextMiddleware,
  listExtraServices,
);
router.post(
  "/v1/extra-services",
  authMiddleware,
  businessContextMiddleware,
  createExtraService,
);
router.patch(
  "/v1/extra-services/:id",
  authMiddleware,
  businessContextMiddleware,
  updateExtraService,
);
router.delete(
  "/v1/extra-services/:id",
  authMiddleware,
  businessContextMiddleware,
  deleteExtraService,
);
router.post(
  "/v1/bookings/:bookingId/extra-services",
  authMiddleware,
  businessContextMiddleware,
  setBookingExtraServices,
);

module.exports = router;
