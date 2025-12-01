const { Reservation, Payment } = require("../../models")
const { addPayment, deletePayment } = require("../../services/paymentService")
const logger = require("../../config/logger")

module.exports = {
  async add(req, res) {
    const { reservation_id, amount, method, comment } = req.body

    try {
      const result = await addPayment(reservation_id, { amount, method, comment }, req.user.id)

      logger.info(`Payment added to reservation: ${reservation_id}`)

      res.status(201).json({
        status: 201,
        message: "Payment added successfully",
        data: result,
      })
    } catch (err) {
      logger.error("Add payment error:", err)
      res.status(err.status || 500).json({
        status: err.status || 500,
        message: err.message || "Payment add failed",
      })
    }
  },

  async list(req, res) {
    const { reservation_id, limit = 10, offset = 0 } = req.query

    try {
      const where = {}
      if (reservation_id) where.reservation_id = reservation_id

      const payments = await Payment.findAndCountAll({
        where,
        include: [{ model: Reservation, as: "reservation" }],
        limit: Number.parseInt(limit),
        offset: Number.parseInt(offset),
        order: [["createdAt", "DESC"]],
      })

      res.json({
        status: 200,
        message: "Payments retrieved",
        data: payments.rows,
        total: payments.count,
      })
    } catch (err) {
      logger.error("List payments error:", err)
      res.status(500).json({
        status: 500,
        message: "Failed to retrieve payments",
      })
    }
  },

  async delete(req, res) {
    const { id } = req.params
    const { reservation_id } = req.body

    try {
      const result = await deletePayment(id, reservation_id, req.user.id)

      logger.info(`Payment deleted: ${id}`)

      res.json({
        status: 200,
        message: result.message,
        data: result,
      })
    } catch (err) {
      logger.error("Delete payment error:", err)
      res.status(err.status || 500).json({
        status: err.status || 500,
        message: err.message || "Payment delete failed",
      })
    }
  },
}
