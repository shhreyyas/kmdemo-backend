const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");

router.get("/v1/get-category", getCategory);

router.post("/v1/create-category", authMiddleware, adminMiddleware, createCategory);

router.put("/v1/update-category/:id", authMiddleware, adminMiddleware, updateCategory);

router.delete("/v1/delete-category/:id", authMiddleware, adminMiddleware, deleteCategory);

module.exports = router;
