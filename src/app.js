require("express-async-errors")
require("dotenv").config()
const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const path = require("path")
const cron = require("node-cron")

// Models / Services
const ActionLog = require("./models/ActionLog")      // 🟢 => IMPORTANT
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
   🔵 STOCKAGE INTERNE DU CRON
==================================== */
let latestLogs = {
  timestamp: null,
  total: 0,
  logs: []
}

/* ====================================
   CRON JOB — toutes les 10 minutes
==================================== */
cron.schedule("*/10 * * * *", async () => {
  try {
    console.log("⏱️ Cron exécuté :", new Date().toISOString())

    const result = await actionLogService.getAllLogs(100, 0)

    latestLogs = {
      timestamp: new Date().toISOString(),
      total: result?.count || 0,
      logs: result?.rows || []
    }

    console.log(`📘 Logs mis à jour : ${latestLogs.total} entrées`)
  } catch (err) {
    console.error("❌ Erreur CRON :", err.message)
  }
})

/* ====================================
   HEALTH CHECK — amélioré
==================================== */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    logs_last_update: latestLogs.timestamp,
    logs_total: latestLogs.total,
    
    // ⬇ on renvoie seulement les 10 derniers 
    logs_preview: latestLogs.logs.slice(0, 10)
  })
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
