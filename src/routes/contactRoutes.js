const express = require("express");
const router = express.Router();
const { submitContact } = require("../controllers/contactController");

router.post("/contact-us", submitContact);

module.exports = router;
