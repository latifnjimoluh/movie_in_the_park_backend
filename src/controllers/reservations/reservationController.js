const { Reservation, Pack, Payment, Participant, ActionLog, Ticket } = require("../../models")
const logger = require("../../config/logger")
const auditService = require("../../services/auditService")

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

    const total_price = pack.price
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

    await auditService.log({
      userId: req.user.id,
      permission: "reservations.create",
      entityType: "reservation",
      entityId: reservation.id,
      action: "create",
      description: `Réservation créée pour ${payeur_name} - Forfait: ${pack.name}`,
      changes: {
        payeur_name,
        payeur_phone,
        payeur_email,
        pack_id,
        quantity,
        total_price,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

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

    const changes = {}
    if (payeur_name !== undefined && payeur_name !== reservation.payeur_name)
      changes.payeur_name = { from: reservation.payeur_name, to: payeur_name }
    if (payeur_phone !== undefined && payeur_phone !== reservation.payeur_phone)
      changes.payeur_phone = { from: reservation.payeur_phone, to: payeur_phone }
    if (payeur_email !== undefined && payeur_email !== reservation.payeur_email)
      changes.payeur_email = { from: reservation.payeur_email, to: payeur_email }

    await reservation.update({
      payeur_name: payeur_name || reservation.payeur_name,
      payeur_phone: payeur_phone || reservation.payeur_phone,
      payeur_email: payeur_email || reservation.payeur_email,
    })

    logger.info(`Reservation updated: ${id}`)

    if (Object.keys(changes).length > 0) {
      await auditService.log({
        userId: req.user.id,
        permission: "reservations.edit",
        entityType: "reservation",
        entityId: id,
        action: "update",
        description: `Réservation modifiée`,
        changes,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })
    }

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

    await auditService.log({
      userId: req.user.id,
      permission: "reservations.delete.soft",
      entityType: "reservation",
      entityId: id,
      action: "cancel",
      description: `Réservation annulée`,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.json({
      status: 200,
      message: "Reservation cancelled",
      data: reservation,
    })
  },

  async permanentlyDelete(req, res) {
    const { id } = req.params

    const reservation = await Reservation.findByPk(id, {
      include: [
        { model: Ticket, as: "tickets" },
        { model: ActionLog, as: "actionLogs" },
        { model: Participant, as: "participants" },
        { model: Payment, as: "payments" },
      ],
    })

    if (!reservation) {
      return res.status(404).json({
        status: 404,
        message: "Reservation not found",
      })
    }

    if (reservation.status === "ticket_generated") {
      return res.status(409).json({
        status: 409,
        message: "Cannot permanently delete reservation after ticket generation",
      })
    }

    try {
      if (reservation.actionLogs && reservation.actionLogs.length > 0) {
        await ActionLog.destroy({
          where: { reservation_id: id },
        })
      }

      if (reservation.tickets && reservation.tickets.length > 0) {
        await Ticket.destroy({
          where: { reservation_id: id },
        })
      }

      if (reservation.participants && reservation.participants.length > 0) {
        await Participant.destroy({
          where: { reservation_id: id },
        })
      }

      if (reservation.payments && reservation.payments.length > 0) {
        await Payment.destroy({
          where: { reservation_id: id },
        })
      }

      await reservation.destroy()

      logger.info(`Reservation permanently deleted: ${id}`)

      await auditService.log({
        userId: req.user.id,
        permission: "reservations.delete.permanent",
        entityType: "reservation",
        entityId: id,
        action: "permanently_delete",
        description: `Réservation supprimée définitivement`,
        changes: {
          deleted_count: {
            actionLogs: reservation.actionLogs?.length || 0,
            tickets: reservation.tickets?.length || 0,
            participants: reservation.participants?.length || 0,
            payments: reservation.payments?.length || 0,
          },
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      res.json({
        status: 200,
        message: "Reservation permanently deleted",
      })
    } catch (error) {
      logger.error(`Error permanently deleting reservation ${id}:`, error.message)
      res.status(500).json({
        status: 500,
        message: `Erreur lors de la suppression de la réservation: ${error.message || "Une erreur est survenue"}`,
      })
    }
  },
}
