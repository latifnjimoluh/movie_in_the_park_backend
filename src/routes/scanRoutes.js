const express = require("express")
const { Ticket, Participant, ActionLog } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { verifySignature } = require("../utils/hmac")

const router = express.Router()

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

    if (
      !verifySignature(
        `${payload.ticket_number}|${payload.reservation_id}|${payload.timestamp}`,
        payload.signature,
        process.env.QR_SECRET,
      )
    ) {
      return res.status(401).json({
        status: 401,
        message: "Invalid QR signature",
      })
    }

    res.json({
      status: 200,
      message: "QR decoded",
      data: {
        ticket,
        reservation: ticket.reservation,
      },
    })
  } catch (err) {
    res.status(400).json({
      status: 400,
      message: "Invalid QR payload",
    })
  }
})

router.post("/validate", verifyToken, checkPermission("scan.validate"), async (req, res) => {
  const { ticket_number, participant_ids } = req.body

  try {
    const ticket = await Ticket.findOne({
      where: { ticket_number },
      include: [{ association: "reservation" }],
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

    for (const participantId of participant_ids) {
      await Participant.update({ entrance_validated: true }, { where: { id: participantId } })
    }

    await ticket.update({ status: "used" })

    await ActionLog.create({
      user_id: req.user.id,
      reservation_id: ticket.reservation_id,
      action_type: "entry.validate",
      meta: {
        ticket_number,
        participant_ids,
      },
    })

    res.json({
      status: 200,
      message: "Entry validated",
      data: { ticket },
    })
  } catch (err) {
    res.status(500).json({
      status: 500,
      message: "Validation error",
    })
  }
})

module.exports = router
