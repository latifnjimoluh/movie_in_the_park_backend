const { Reservation, Pack, Payment, Participant } = require("../../models")
const logger = require("../../config/logger")

module.exports = {
  async getAll(req, res) {
    const { status, pack_id, limit = 10, offset = 0 } = req.query

    const where = {}
    if (status) where.status = status
    if (pack_id) where.pack_id = pack_id

    const reservations = await Reservation.findAndCountAll({
      where,
      include: [
        { model: Pack, as: "pack" },
        { model: Payment, as: "payments" },
        { model: Participant, as: "participants" },
      ],
      limit: Number.parseInt(limit),
      offset: Number.parseInt(offset),
      order: [["createdAt", "DESC"]],
    })

    res.json({
      status: 200,
      message: "Reservations retrieved",
      data: reservations.rows,
      total: reservations.count,
    })
  },

  async getOne(req, res) {
    const { id } = req.params

    const reservation = await Reservation.findByPk(id, {
      include: [
        { model: Pack, as: "pack" },
        { model: Payment, as: "payments" },
        { model: Participant, as: "participants" },
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
      data: reservation,
    })
  },

  async create(req, res) {
    const { payeur_name, payeur_phone, payeur_email, pack_id, quantity, participants } = req.body

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

    if (participants && participants.length > 0) {
      await Promise.all(
        participants.map((p) =>
          Participant.create({
            reservation_id: reservation.id,
            name: p.name,
            email: p.email,
          }),
        ),
      )
    }

    logger.info(`Reservation created: ${reservation.id}`)

    res.status(201).json({
      status: 201,
      message: "Reservation created",
      data: reservation,
    })
  },

  async update(req, res) {
    const { id } = req.params
    const { payeur_name, payeur_phone, payeur_email } = req.body

    const reservation = await Reservation.findByPk(id)
    if (!reservation) {
      return res.status(404).json({
        status: 404,
        message: "Reservation not found",
      })
    }

    if (reservation.status === "ticket_generated") {
      return res.status(409).json({
        status: 409,
        message: "Cannot update reservation after ticket generation",
      })
    }

    await reservation.update({
      payeur_name: payeur_name || reservation.payeur_name,
      payeur_phone: payeur_phone || reservation.payeur_phone,
      payeur_email: payeur_email || reservation.payeur_email,
    })

    logger.info(`Reservation updated: ${id}`)

    res.json({
      status: 200,
      message: "Reservation updated",
      data: reservation,
    })
  },

  async cancel(req, res) {
    const { id } = req.params

    const reservation = await Reservation.findByPk(id)
    if (!reservation) {
      return res.status(404).json({
        status: 404,
        message: "Reservation not found",
      })
    }

    if (reservation.status === "ticket_generated") {
      return res.status(409).json({
        status: 409,
        message: "Cannot cancel reservation after ticket generation",
      })
    }

    await reservation.update({ status: "cancelled" })

    logger.info(`Reservation cancelled: ${id}`)

    res.json({
      status: 200,
      message: "Reservation cancelled",
      data: reservation,
    })
  },
}
