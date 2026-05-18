const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const businessContextMiddleware = require("../middleware/businessContextMiddleware");
const {
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  getStaffById,
  getEventStaff,
  assignEventStaff,
  unassignEventStaff,
  listAvailableStaffForEvent,
} = require("../controllers/staffController");

router.get("/v1/staff", authMiddleware, businessContextMiddleware, listStaff);
router.post("/v1/staff", authMiddleware, businessContextMiddleware, createStaff);
router.get(
  "/v1/staff/:id",
  authMiddleware,
  businessContextMiddleware,
  getStaffById,
);
router.patch(
  "/v1/staff/:id",
  authMiddleware,
  businessContextMiddleware,
  updateStaff,
);
router.delete(
  "/v1/staff/:id",
  authMiddleware,
  businessContextMiddleware,
  deleteStaff,
);
router.get(
  "/v1/booking-events/:eventId/staff",
  authMiddleware,
  businessContextMiddleware,
  getEventStaff,
);
router.get(
  "/v1/booking-events/:eventId/staff/available",
  authMiddleware,
  businessContextMiddleware,
  listAvailableStaffForEvent,
);
router.post(
  "/v1/booking-events/:eventId/staff",
  authMiddleware,
  businessContextMiddleware,
  assignEventStaff,
);
router.delete(
  "/v1/booking-events/:eventId/staff/:staffId",
  authMiddleware,
  businessContextMiddleware,
  unassignEventStaff,
);

module.exports = router;
