const express = require("express")
const authRoutes = require("./authRoutes")
const reservationRoutes = require("./reservationRoutes")
const paymentRoutes = require("./paymentRoutes")
const ticketRoutes = require("./ticketRoutes")
const scanRoutes = require("./scanRoutes")
const packRoutes = require("./packRoutes")

const router = express.Router()

router.use("/auth", authRoutes)
router.use("/reservations", reservationRoutes)
router.use("/payments", paymentRoutes)
router.use("/tickets", ticketRoutes)
router.use("/scan", scanRoutes)
router.use("/packs", packRoutes)

module.exports = router
