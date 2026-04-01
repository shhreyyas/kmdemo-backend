const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes (see test.md — paths under /api)
const authRoutes = require("./routes/authRoutes");
app.use("/api", authRoutes);

const businessRoutes = require("./routes/businessRoutes");
app.use("/api", businessRoutes);

// Test Route
app.get("/", (req, res) => {
  res.send("Catering API Running");
});

module.exports = app;
