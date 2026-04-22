const express = require("express");
const router = express.Router();
const {
  registerBusiness,
  listServiceTypes,
  createServiceTypes,
  updateBusiness,
  deleteBusiness,
} = require("../controllers/businessController");
const { uploadBusinessImage } = require("../controllers/uploadController");
const authMiddleware = require("../middleware/authMiddleware");
const businessContextMiddleware = require("../middleware/businessContextMiddleware");

router.get("/service-types", listServiceTypes);
router.post("/service-types", authMiddleware, createServiceTypes);
router.post("/v1/upload-business-image", authMiddleware, uploadBusinessImage);
router.post("/business", authMiddleware, registerBusiness);
router.patch(
  "/business",
  authMiddleware,
  businessContextMiddleware,
  updateBusiness,
);
router.delete(
  "/business",
  authMiddleware,
  businessContextMiddleware,
  deleteBusiness,
);

module.exports = router;
