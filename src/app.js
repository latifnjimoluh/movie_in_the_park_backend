require("express-async-errors")
require("dotenv").config()
const express = require("express")
const cors = require("cors")
const helmet = require("helmet")

// Routes
const authRoutes = require("./routes/authRoutes")
const packRoutes = require("./routes/packRoutes")
const reservationRoutes = require("./routes/reservationRoutes")
const paymentRoutes = require("./routes/paymentRoutes")
const ticketRoutes = require("./routes/ticketRoutes")
const scanRoutes = require("./routes/scanRoutes")

// Middleware
const { errorHandler } = require("./middlewares/errorHandler")

const app = express()

app.use(helmet())
app.use(cors())
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ limit: "10mb", extended: true }))

// Serve static files for uploads
app.use("/uploads", express.static("uploads"))

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/packs", packRoutes)
app.use("/api/reservations", reservationRoutes)
app.use("/api/payments", paymentRoutes)
app.use("/api/tickets", ticketRoutes)
app.use("/api/scan", scanRoutes)

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: 404, message: "Route not found" })
})

// Error handler
app.use(errorHandler)

module.exports = app
