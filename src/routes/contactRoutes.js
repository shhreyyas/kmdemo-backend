const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { submitContact } = require("../controllers/contactController");

router.post("/contact-us", authMiddleware, submitContact);

module.exports = router;
