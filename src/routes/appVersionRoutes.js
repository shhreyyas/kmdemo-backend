const express = require("express");
const router = express.Router();
const { getLatestVersion } = require("../controllers/appVersionController");

router.get("/app-latest-version", getLatestVersion);

module.exports = router;
