const express = require("express");
const router = express.Router();
const {
  registerBusiness,
  listServiceTypes,
  createServiceTypes,
  updateBusiness,
} = require("../controllers/businessController");
const authMiddleware = require("../middleware/authMiddleware");
const businessContextMiddleware = require("../middleware/businessContextMiddleware");

router.get("/service-types", listServiceTypes);
router.post("/service-types", authMiddleware, createServiceTypes);
router.post("/business", authMiddleware, registerBusiness);
router.patch(
  "/business",
  authMiddleware,
  businessContextMiddleware,
  updateBusiness,
);

module.exports = router;
