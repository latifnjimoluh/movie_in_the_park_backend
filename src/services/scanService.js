const jwt = require("jsonwebtoken")
const { Ticket, Participant, ActionLog } = require("../models")
const { verifySignature } = require("../utils/hmac")
const logger = require("../config/logger")

module.exports = {
  async validateQRCode(qrPayload) {
    try {
      const payload = JSON.parse(qrPayload)

      if (
        !verifySignature(
          `${payload.ticket_number}|${payload.reservation_id}|${payload.timestamp}`,
          payload.signature,
          process.env.QR_SECRET,
        )
      ) {
        throw { status: 401, message: "Invalid QR signature" }
      }

      const ticket = await Ticket.findOne({
        where: { ticket_number: payload.ticket_number },
        include: [{ association: "reservation" }],
      })

      if (!ticket) {
        throw { status: 404, message: "Ticket not found" }
      }

      return ticket
    } catch (err) {
      logger.error("QR validation error:", err.message)
      throw err
    }
  },

  async scanTicket(ticketNumber, userId) {
    const ticket = await Ticket.findOne({
      where: { ticket_number: ticketNumber },
      include: [{ association: "reservation" }],
    })

    if (!ticket) {
      throw { status: 404, message: "Ticket not found" }
    }

    if (ticket.status === "used") {
      throw { status: 409, message: "Ticket already used" }
    }

    if (ticket.status === "cancelled") {
      throw { status: 409, message: "Ticket is cancelled" }
    }

    await ticket.update({ status: "used" })

    await ActionLog.create({
      user_id: userId,
      reservation_id: ticket.reservation_id,
      action_type: "ticket.scanned",
      meta: {
        ticket_id: ticket.id,
        ticket_number: ticketNumber,
      },
    })

    logger.info(`Ticket scanned: ${ticketNumber}`)

    return ticket
  },

  async getScanStats() {
    const totalScanned = await Ticket.count({ where: { status: "used" } })
    const validTickets = await Ticket.count({ where: { status: "valid" } })
    const totalTickets = await Ticket.count()

    return {
      total_tickets: totalTickets,
      total_scanned: totalScanned,
      valid_tickets: validTickets,
      scanned_percentage: totalTickets > 0 ? Math.round((totalScanned / totalTickets) * 100) : 0,
    }
  },
}
