const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const businessContextMiddleware = require("../middleware/businessContextMiddleware");
const {
  createSupplyItem,
  listSupplyItems,
  updateSupplyItem,
  deleteSupplyItem,
  setBookingSupplyItems,
  getBookingSupplyItems,
  setEventSupplyItems,
  getEventSupplyItems,
  updateEventSupplyItem,
  deleteEventSupplyItem,
  shareBookingSupplyItems,
  shareEventSupplyItems,
} = require("../controllers/supplyController");

router.post(
  "/v1/createSupplyItem",
  authMiddleware,
  businessContextMiddleware,
  createSupplyItem,
);
router.get(
  "/v1/listSupplyItems",
  authMiddleware,
  businessContextMiddleware,
  listSupplyItems,
);
router.put(
  "/v1/updateSupplyItem/:id",
  authMiddleware,
  businessContextMiddleware,
  updateSupplyItem,
);
router.delete(
  "/v1/deleteSupplyItem/:id",
  authMiddleware,
  businessContextMiddleware,
  deleteSupplyItem,
);

router.post(
  "/v1/bookings/:id/setSupplyItems",
  authMiddleware,
  businessContextMiddleware,
  setBookingSupplyItems,
);
router.get(
  "/v1/bookings/:id/supplyItems",
  authMiddleware,
  businessContextMiddleware,
  getBookingSupplyItems,
);

router.post(
  "/v1/bookings/:id/events/:eventId/setSupplyItems",
  authMiddleware,
  businessContextMiddleware,
  setEventSupplyItems,
);
router.get(
  "/v1/bookings/:id/events/:eventId/supplyItems",
  authMiddleware,
  businessContextMiddleware,
  getEventSupplyItems,
);
router.patch(
  "/v1/bookings/:id/events/:eventId/supplyItems/:supplyItemId",
  authMiddleware,
  businessContextMiddleware,
  updateEventSupplyItem,
);
router.delete(
  "/v1/bookings/:id/events/:eventId/supplyItems/:supplyItemId",
  authMiddleware,
  businessContextMiddleware,
  deleteEventSupplyItem,
);

router.post(
  "/v1/bookings/:id/supplyItems/share",
  authMiddleware,
  businessContextMiddleware,
  shareBookingSupplyItems,
);
router.post(
  "/v1/bookings/:id/events/:eventId/supplyItems/share",
  authMiddleware,
  businessContextMiddleware,
  shareEventSupplyItems,
);

module.exports = router;
