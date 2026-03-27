const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const licenseRoutes = require("./routes/licenseRoutes");
app.use("/api/license", licenseRoutes);

const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

const businessRoutes = require("./routes/businessRoutes");
app.use("/api/business", businessRoutes);

// Test Route
app.get("/", (req, res) => {
  res.send("Catering API Running");
});

module.exports = app;
