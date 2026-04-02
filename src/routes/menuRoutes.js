const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const businessContextMiddleware = require("../middleware/businessContextMiddleware");
const {
  createMenuItem,
  listMenuItems,
  getMenuItem,
  updateMenuItem,
  deleteMenuItem,
} = require("../controllers/menuController");
const { uploadMenuImage } = require("../controllers/uploadController");

router.post(
  "/v1/upload-menu-image",
  authMiddleware,
  businessContextMiddleware,
  uploadMenuImage,
);
router.post(
  "/v1/create-menu",
  authMiddleware,
  businessContextMiddleware,
  createMenuItem,
);
router.get(
  "/v1/get-menu-list",
  authMiddleware,
  businessContextMiddleware,
  listMenuItems,
);
router.get(
  "/v1/get-menu-item/:id",
  authMiddleware,
  businessContextMiddleware,
  getMenuItem,
);
router.put(
  "/v1/update-menu-item/:id",
  authMiddleware,
  businessContextMiddleware,
  updateMenuItem,
);
router.delete(
  "/v1/delete-menu-item/:id",
  authMiddleware,
  businessContextMiddleware,
  deleteMenuItem,
);

module.exports = router;
