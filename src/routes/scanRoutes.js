const express = require("express")
const { Ticket, Participant, ActionLog, Reservation } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { verifySignature } = require("../utils/hmac")
const scanService = require("../services/scanService")

const router = express.Router()

/* ===========================================
    🔍 1 — DECODE LE QR CODE (HMAC)
=========================================== */
router.post("/decode", async (req, res) => {
  const { qr_payload } = req.body

  try {
    const payload = JSON.parse(qr_payload)

    const ticket = await Ticket.findOne({
      where: { ticket_number: payload.ticket_number },
      include: [
        {
          association: "reservation",
          include: [{ association: "participants" }],
        },
      ],
    })

    if (!ticket) {
      return res.status(404).json({
        status: 404,
        message: "Ticket not found",
      })
    }

    // Vérification signature HMAC
    const isValid = verifySignature(
      `${payload.ticket_number}|${payload.reservation_id}|${payload.timestamp}`,
      payload.signature,
      process.env.QR_SECRET,
    )

    if (!isValid) {
      return res.status(401).json({
        status: 401,
        message: "Invalid QR signature",
      })
    }

    return res.json({
      status: 200,
      message: "QR decoded",
      data: {
        ticket,
        reservation: ticket.reservation,
      },
    })
  } catch (err) {
    return res.status(400).json({
      status: 400,
      message: "Invalid QR payload",
    })
  }
})

/* ===========================================
    🔍 SEARCH TICKET BY NUMBER (MANUAL IMPORT)
=========================================== */
router.post("/search", async (req, res) => {
  const { ticket_number } = req.body

  try {
    if (!ticket_number || typeof ticket_number !== "string") {
      return res.status(400).json({
        status: 400,
        message: "Invalid ticket number",
      })
    }

    const ticket = await Ticket.findOne({
      where: { ticket_number: ticket_number.toUpperCase() },
      include: [
        {
          association: "reservation",
          include: [{ association: "participants" }],
        },
      ],
    })

    if (!ticket) {
      return res.status(404).json({
        status: 404,
        message: "Ticket not found",
      })
    }

    return res.json({
      status: 200,
      message: "Ticket found",
      data: {
        ticket,
        reservation: ticket.reservation,
      },
    })
  } catch (err) {
    return res.status(400).json({
      status: 400,
      message: "Invalid request",
    })
  }
})

/* ===========================================
    🎫 2 — VALIDATION D'UN PARTICIPANT
=========================================== */
router.post("/validate", verifyToken, checkPermission("scan.validate"), async (req, res) => {
  const { ticket_number, participant_id } = req.body

  try {
    const ticket = await Ticket.findOne({
      where: { ticket_number },
      include: [{ model: Reservation, as: "reservation" }],
    })

    if (!ticket) {
      return res.status(404).json({
        status: 404,
        message: "Ticket not found",
      })
    }

    if (ticket.status !== "valid") {
      return res.status(409).json({
        status: 409,
        message: "Ticket already used or cancelled",
      })
    }

    // Vérifier si le participant appartient à la réservation
    const participant = await Participant.findOne({
      where: { id: participant_id, reservation_id: ticket.reservation_id },
    })

    if (!participant) {
      return res.status(400).json({
        status: 400,
        message: "Participant not found for this ticket",
      })
    }

    // Valider le participant
    await participant.update({
      entrance_validated: true,
      ticket_id: ticket.id,
    })

    // Tester si tous les participants sont validés
    const total = await Participant.count({
      where: { reservation_id: ticket.reservation_id },
    })

    const validated = await Participant.count({
      where: {
        reservation_id: ticket.reservation_id,
        entrance_validated: true,
      },
    })

    if (total === validated) {
      await ticket.update({ status: "used" })
    }

    // Log action
    await ActionLog.create({
      user_id: req.user.id,
      reservation_id: ticket.reservation_id,
      action_type: "entry.validate",
      meta: {
        ticket_number,
        participant_id,
      },
    })

    return res.json({
      status: 200,
      message: "Participant validated",
      data: {
        ticket_status: total === validated ? "used" : "valid",
        participant,
      },
    })
  } catch (err) {
    console.error("VALIDATE ERROR:", err)
    return res.status(500).json({
      status: 500,
      message: "Validation error",
    })
  }
})

/* ===========================================
    📊 STATS — GET SCAN AND VALIDATION STATS
=========================================== */
router.get("/stats", verifyToken, async (req, res) => {
  try {
    // Get count of validated participants (entrées validées)
    const validatedEntries = await Participant.count({
      where: { entrance_validated: true },
    })

    // Get scan statistics from service
    const scanStats = await scanService.getScanStats()

    res.json({
      status: 200,
      message: "Scan statistics",
      data: {
        ...scanStats,
        validated_entries: validatedEntries,
      },
    })
  } catch (err) {
    console.error("Stats error:", err)
    res.status(500).json({
      status: 500,
      message: "Error retrieving statistics",
    })
  }
})

module.exports = router
