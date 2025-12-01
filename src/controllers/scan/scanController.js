const jwt = require("jsonwebtoken")
const { Ticket, Participant, Reservation } = require("../../models")
const { ActionLog } = require("../../models")
const logger = require("../../config/logger")

module.exports = {
  async validateAndScan(req, res) {
    const { qr_payload } = req.body

    try {
      const decoded = jwt.verify(qr_payload, process.env.JWT_SECRET)

      const ticket = await Ticket.findOne({
        where: { ticket_number: decoded.ticket_number },
        include: [
          { model: Participant, as: "participants" },
          { model: Reservation, as: "reservation" },
        ],
      })

      if (!ticket) {
        return res.status(404).json({
          status: 404,
          message: "Ticket not found",
        })
      }

      if (ticket.status === "used") {
        logger.warn(`Ticket already used: ${ticket.id}`)
        return res.status(409).json({
          status: 409,
          message: "Ticket already used",
        })
      }

      if (ticket.status === "cancelled") {
        logger.warn(`Cancelled ticket scan attempt: ${ticket.id}`)
        return res.status(409).json({
          status: 409,
          message: "Ticket is cancelled",
        })
      }

      await ticket.update({ status: "used" })

      await ActionLog.create({
        user_id: req.user.id,
        action_type: "ticket.scanned",
        meta: {
          ticket_id: ticket.id,
          reservation_id: ticket.reservation_id,
        },
      })

      logger.info(`Ticket scanned: ${ticket.id}`)

      res.json({
        status: 200,
        message: "Ticket valid and scanned",
        data: ticket,
      })
    } catch (err) {
      logger.error("Ticket validation error:", err.message)
      res.status(401).json({
        status: 401,
        message: "Invalid QR code",
      })
    }
  },

  async getStats(req, res) {
    const totalScanned = await Ticket.count({ where: { status: "used" } })
    const validTickets = await Ticket.count({ where: { status: "valid" } })

    res.json({
      status: 200,
      message: "Scan statistics",
      data: {
        total_scanned: totalScanned,
        valid_tickets: validTickets,
      },
    })
  },
}
