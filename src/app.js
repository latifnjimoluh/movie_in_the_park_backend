require("express-async-errors")
require("dotenv").config()
const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const path = require("path")
const cron = require("node-cron")
const fetch = require("node-fetch")

// Models / Services
const ActionLog = require("./models/ActionLog")
const actionLogService = require("./services/logService")

// Routes
const authRoutes = require("./routes/authRoutes")
const packRoutes = require("./routes/packRoutes")
const reservationRoutes = require("./routes/reservationRoutes")
const paymentRoutes = require("./routes/paymentRoutes")
const ticketRoutes = require("./routes/ticketRoutes")
const scanRoutes = require("./routes/scanRoutes")
const userRoutes = require("./routes/userRoutes")

// Middleware
const { errorHandler } = require("./middlewares/errorHandler")

const app = express()

/* ====================================
   SECURITY
==================================== */
app.use(helmet())

/* ====================================
   CORS
==================================== */
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:3000",
    "http://localhost:3000"
  ],
  credentials: true
}))

/* ====================================
   PARSERS
==================================== */
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ limit: "10mb", extended: true }))

/* ====================================
   STATIC FILES
==================================== */
const uploadPath = path.join(process.cwd(), "uploads")
app.use("/uploads", express.static(uploadPath))

/* ====================================
   ROUTES
==================================== */
app.use("/api/auth", authRoutes)
app.use("/api/packs", packRoutes)
app.use("/api/reservations", reservationRoutes)
app.use("/api/payments", paymentRoutes)
app.use("/api/tickets", ticketRoutes)
app.use("/api/scan", scanRoutes)
app.use("/api/users", userRoutes)

/* ====================================
   HEALTH CHECK — amélioré
==================================== */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  })
})

/* ====================================
   KEEPALIVE ENDPOINT
==================================== */
app.get("/api/keepalive", (req, res) => {
  res.json({
    status: "alive",
    time: new Date().toISOString()
  })
})

/* ====================================
   🔥 NOUVEAU CRON — KEEP ALIVE
   Toutes les 10 minutes
==================================== */
cron.schedule("*/10 * * * *", async () => {
  console.log("⏱️ CRON KEEPALIVE lancé :", new Date().toISOString())

  const frontendUrl = process.env.FRONTEND_LOGIN_URL
  const backendUrl = process.env.BACKEND_KEEPALIVE_URL

  try {
    // Ping du frontend
    if (frontendUrl) {
      const res1 = await fetch(frontendUrl)
      console.log("🌐 Ping frontend login :", res1.status)
    }

    // Ping du backend
    if (backendUrl) {
      const res2 = await fetch(backendUrl)
      console.log("🟢 Ping backend keepalive :", res2.status)
    }
  } catch (err) {
    console.error("❌ Erreur CRON keepalive :", err.message)
  }
})

/* ====================================
   404 HANDLER
==================================== */
app.use((req, res) => {
  res.status(404).json({ status: 404, message: "Route not found" })
})

/* ====================================
   ERROR HANDLER
==================================== */
app.use(errorHandler)

module.exports = app
