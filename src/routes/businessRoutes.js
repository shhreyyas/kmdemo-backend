const express = require("express");
const router = express.Router();
const {
  registerBusiness,
  listServiceTypes,
} = require("../controllers/businessController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/service-types", listServiceTypes);
router.post("/business", authMiddleware, registerBusiness);

module.exports = router;
