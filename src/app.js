const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "uploads")),
);

// Routes (see test.md — paths under /api)
const authRoutes = require("./routes/authRoutes");
app.use("/api", authRoutes);

const businessRoutes = require("./routes/businessRoutes");
app.use("/api", businessRoutes);

const menuRoutes = require("./routes/menuRoutes");
app.use("/api", menuRoutes);

const categoryRoutes = require("./routes/categoryRoutes");
app.use("/api", categoryRoutes);

const bookingRoutes = require("./routes/bookingRoutes");
app.use("/api", bookingRoutes);

const quotationRoutes = require("./routes/quotationRoutes");
app.use("/api", quotationRoutes);

const contactRoutes = require("./routes/contactRoutes");
app.use("/api", contactRoutes);

// Test Route
app.get("/", (req, res) => {
  res.send("Catering API Running");
});

module.exports = app;
