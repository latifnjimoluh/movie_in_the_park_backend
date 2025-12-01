const { addPayment, deletePayment } = require("../../services/paymentService")
const logger = require("../../config/logger")

module.exports = {
  async addPayment(req, res) {
    const { reservation_id, amount, method, comment } = req.body

    try {
      const result = await addPayment(reservation_id, { amount, method, comment }, req.user.id)

      res.status(201).json({
        status: 201,
        message: "Payment added successfully",
        data: result,
      })
    } catch (err) {
      logger.error("Add payment error:", err)
      res.status(err.status || 500).json({
        status: err.status || 500,
        message: err.message || "Payment failed",
      })
    }
  },

  async deletePayment(req, res) {
    const { reservation_id, payment_id } = req.params

    try {
      const result = await deletePayment(payment_id, reservation_id, req.user.id)

      res.json({
        status: 200,
        message: "Payment deleted successfully",
        data: result,
      })
    } catch (err) {
      logger.error("Delete payment error:", err)
      res.status(err.status || 500).json({
        status: err.status || 500,
        message: err.message || "Delete payment failed",
      })
    }
  },
}
