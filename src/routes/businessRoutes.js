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

router.get("/v1/getservicetypes", listServiceTypes);
router.post("/v1/createServiceTypes", authMiddleware, createServiceTypes);
router.post("/v1/upload-business-image", authMiddleware, uploadBusinessImage);
router.post("/v1/registerBusiness", authMiddleware, registerBusiness);
router.patch(
  "/v1/updateBusiness",
  authMiddleware,
  businessContextMiddleware,
  updateBusiness,
);
router.delete(
  "/v1/deleteBusiness",
  authMiddleware,
  businessContextMiddleware,
  deleteBusiness,
);

module.exports = router;
