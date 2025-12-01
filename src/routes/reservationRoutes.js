const express = require("express")
const { Reservation, Participant, Pack, Payment } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { validate, createReservationSchema } = require("../middlewares/validation")
const { addPayment } = require("../services/paymentService")

const router = express.Router()

router.get("/", verifyToken, checkPermission("reservations.view"), async (req, res) => {
  const { q, status, page = 1, pageSize = 20 } = req.query

  let where = {}

  if (status) where.status = status

  if (q) {
    const { Op } = require("sequelize")
    where = {
      ...where,
      [Op.or]: [{ payeur_name: { [Op.iLike]: `%${q}%` } }, { payeur_phone: { [Op.iLike]: `%${q}%` } }],
    }
  }

  const { count, rows } = await Reservation.findAndCountAll({
    where,
    include: [
      { association: "participants" },
      { association: "payments" },
      { association: "pack", attributes: ["name"] },
    ],
    offset: (page - 1) * pageSize,
    limit: Number.parseInt(pageSize),
    order: [["createdAt", "DESC"]],
  })

  res.json({
    status: 200,
    message: "Reservations retrieved",
    data: {
      reservations: rows,
      pagination: {
        total: count,
        page: Number.parseInt(page),
        pageSize: Number.parseInt(pageSize),
        totalPages: Math.ceil(count / pageSize),
      },
    },
  })
})

router.post("/", validate(createReservationSchema), async (req, res) => {
  const { payeur_name, payeur_phone, payeur_email, pack_id, quantity, participants } = req.validatedData

  const pack = await Pack.findByPk(pack_id)

  if (!pack) {
    return res.status(404).json({
      status: 404,
      message: "Pack not found",
    })
  }

  const total_price = pack.price * quantity

  const reservation = await Reservation.create({
    payeur_name,
    payeur_phone,
    payeur_email,
    pack_id,
    pack_name_snapshot: pack.name,
    unit_price: pack.price,
    quantity,
    total_price,
  })

  for (const participant of participants) {
    await Participant.create({
      reservation_id: reservation.id,
      ...participant,
    })
  }

  const fullReservation = await Reservation.findByPk(reservation.id, {
    include: [{ association: "participants" }],
  })

  res.status(201).json({
    status: 201,
    message: "Reservation created",
    data: { reservation: fullReservation },
  })
})

router.get("/:id", verifyToken, checkPermission("reservations.view"), async (req, res) => {
  const reservation = await Reservation.findByPk(req.params.id, {
    include: [
      { association: "participants" },
      { association: "payments", include: [{ association: "creator", attributes: ["name"] }] },
      { association: "pack" },
      { association: "actions" },
    ],
  })

  if (!reservation) {
    return res.status(404).json({
      status: 404,
      message: "Reservation not found",
    })
  }

  res.json({
    status: 200,
    message: "Reservation retrieved",
    data: { reservation },
  })
})

router.post("/:id/payments", verifyToken, checkPermission("payments.add"), async (req, res) => {
  const { amount, method, comment } = req.body

  try {
    const result = await addPayment(req.params.id, { amount, method, comment }, req.user.id)

    res.json({
      status: 200,
      message: "Payment added",
      data: result,
    })
  } catch (err) {
    const statusCode = err.status || 500
    res.status(statusCode).json({
      status: statusCode,
      message: err.message,
    })
  }
})

module.exports = router
