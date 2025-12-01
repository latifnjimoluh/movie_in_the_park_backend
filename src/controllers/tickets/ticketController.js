const { Reservation, Ticket, Participant } = require("../../models")
const { generateTicket } = require("../../services/ticketService")
const logger = require("../../config/logger")

module.exports = {
  // ---------------- GENERATE TICKET (secure) ----------------
  async generate(req, res) {
    const { reservation_id } = req.body

    try {
      const reservation = await Reservation.findByPk(reservation_id)
      if (!reservation) {
        return res.status(404).json({
          status: 404,
          message: "Reservation not found"
        })
      }

      if (reservation.status !== "paid") {
        return res.status(409).json({
          status: 409,
          message: "Reservation must be paid before generating ticket"
        })
      }

      const ticket = await generateTicket(reservation_id, req.user.id)

      logger.info(`Ticket generated: ${ticket.id}`)

      res.status(201).json({
        status: 201,
        message: "Ticket generated successfully",
        data: ticket
      })
    } catch (err) {
      logger.error("Ticket generation error:", err)
      res.status(500).json({
        status: 500,
        message: "Ticket generation failed"
      })
    }
  },

  // ---------------- GET ONE TICKET ----------------
  async getTicket(req, res) {
    const { id } = req.params

    const ticket = await Ticket.findByPk(id, {
      include: [
        { model: Reservation, as: "reservation" },
        { model: Participant, as: "participants" }
      ]
    })

    if (!ticket) {
      return res.status(404).json({
        status: 404,
        message: "Ticket not found"
      })
    }

    res.json({
      status: 200,
      message: "Ticket retrieved",
      data: ticket
    })
  }
}
