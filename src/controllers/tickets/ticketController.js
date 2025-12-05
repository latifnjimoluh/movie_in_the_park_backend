const { Reservation, Ticket, Participant } = require("../../models")
const { createTicket } = require("../../services/ticketService")
const logger = require("../../config/logger")
const auditService = require("../../services/auditService")

module.exports = {
  // ---------------- GENERATE TICKET (secure) ----------------
  async generate(req, res) {
    const { reservation_id } = req.body

    try {
      if (!reservation_id) {
        return res.status(400).json({
          status: 400,
          message: "Reservation ID is required",
        })
      }

      const reservation = await Reservation.findByPk(reservation_id)
      if (!reservation) {
        return res.status(404).json({
          status: 404,
          message: "Reservation not found",
        })
      }

      if (reservation.status !== "paid") {
        return res.status(409).json({
          status: 409,
          message: "Reservation must be fully paid before generating ticket",
        })
      }

      const result = await createTicket(reservation_id, req.user.id)

      logger.info(`Ticket generated: ${result.ticket.id}`)

      await auditService.log({
        userId: req.user.id,
        permission: "tickets.generate",
        entityType: "ticket",
        entityId: result.ticket.id,
        action: "generate",
        description: `Ticket généré pour la réservation ${reservation_id}`,
        changes: {
          reservation_id,
          ticket_id: result.ticket.id,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      res.status(201).json({
        status: 201,
        message: "Ticket generated successfully",
        data: result,
      })
    } catch (err) {
      const status = err.status || 500
      const message = err.message || "Ticket generation failed"

      logger.error("Ticket generation error:", { status, message, error: err })

      res.status(status).json({
        status,
        message,
      })
    }
  },

  // ---------------- GET ONE TICKET ----------------
  async getTicket(req, res) {
    const { id } = req.params

    const ticket = await Ticket.findByPk(id, {
      include: [
        { model: Reservation, as: "reservation" },
        { model: Participant, as: "participants" },
      ],
    })

    if (!ticket) {
      return res.status(404).json({
        status: 404,
        message: "Ticket not found",
      })
    }

    res.json({
      status: 200,
      message: "Ticket retrieved",
      data: ticket,
    })
  },
}
