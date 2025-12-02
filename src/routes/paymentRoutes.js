const express = require("express")
const { Payment } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { deletePayment } = require("../services/paymentService")
const logger = require("../config/logger")

const router = express.Router()


// ---------------- GET ALL PAYMENTS ----------------
router.get("/", verifyToken, checkPermission("payments.view"), async (req, res) => {
  const { q, page = 1, pageSize = 20 } = req.query

  let where = {}

  if (q) {
    const { Op } = require("sequelize")
    where = {
      [Op.or]: [{ method: { [Op.iLike]: `%${q}%` } }],
    }
  }

  const { count, rows } = await Payment.findAndCountAll({
    where,
    include: [
      { association: "reservation", attributes: ["payeur_name", "payeur_phone"] },
      { association: "creator", attributes: ["name"] },
    ],
    offset: (page - 1) * pageSize,
    limit: Number.parseInt(pageSize),
    order: [["createdAt", "DESC"]],
  })

  res.json({
    status: 200,
    message: "Payments retrieved",
    data: {
      payments: rows,
      pagination: {
        total: count,
        page: Number.parseInt(page),
        pageSize: Number.parseInt(pageSize),
        totalPages: Math.ceil(count / pageSize),
      },
    },
  })
})


// ---------------- DELETE PAYMENT ----------------
router.delete(
  "/:reservation_id/:payment_id",
  verifyToken,
  checkPermission("payments.delete"),
  async (req, res) => {
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
  }
)

module.exports = router
