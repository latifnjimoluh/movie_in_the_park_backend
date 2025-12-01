const express = require("express")
const { Ticket } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { createTicket } = require("../services/ticketService")

const router = express.Router()

// ---------------- GET ALL TICKETS ----------------
router.get("/", verifyToken, checkPermission("tickets.view"), async (req, res) => {
  const { q, status, page = 1, pageSize = 20 } = req.query

  const where = {}

  if (status) where.status = status

  if (q) {
    const { Op } = require("sequelize")
    where.ticket_number = { [Op.iLike]: `%${q}%` }
  }

  const { count, rows } = await Ticket.findAndCountAll({
    where,
    include: [
      {
        association: "reservation",
        attributes: ["payeur_name", "payeur_phone"]
      }
    ],
    offset: (page - 1) * pageSize,
    limit: Number.parseInt(pageSize),
    order: [["createdAt", "DESC"]]
  })

  res.json({
    status: 200,
    message: "Tickets retrieved",
    data: {
      tickets: rows,
      pagination: {
        total: count,
        page: Number.parseInt(page),
        pageSize: Number.parseInt(pageSize),
        totalPages: Math.ceil(count / pageSize)
      }
    }
  })
})


// ---------------- GENERATE TICKET ----------------
router.post(
  "/:reservationId/generate",
  verifyToken,
  checkPermission("tickets.generate"),
  async (req, res) => {
    try {
      const result = await createTicket(req.params.reservationId, req.user.id)

      res.json({
        status: 200,
        message: "Ticket generated",
        data: result
      })
    } catch (err) {
      res.status(err.status || 500).json({
        status: err.status || 500,
        message: err.message
      })
    }
  }
)

module.exports = router
