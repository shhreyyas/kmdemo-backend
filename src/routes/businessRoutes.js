const express = require("express");
const router = express.Router();
const { createBusinessProfile } = require("../controllers/businessController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/profile", authMiddleware, createBusinessProfile);

module.exports = router;