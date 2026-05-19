const express = require("express");
const router = express.Router();
const { getLatestVersion } = require("../controllers/appVersionController");

router.get("/v1/app-latest-version", getLatestVersion);

module.exports = router;
