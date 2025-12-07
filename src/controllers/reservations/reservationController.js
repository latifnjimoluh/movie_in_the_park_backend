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

    // Audit log pour la lecture de la liste
    await auditService.log({
      userId: req.user.id,
      permission: "reservations.read",
      entityType: "reservation",
      entityId: null, // Pas d'ID spécifique pour une liste
      action: "read",
      description: `Liste des réservations consultée (${reservations.count} résultats)`,
      changes: {
        filters: {
          status,
          pack_id,
          limit: Number.parseInt(limit),
          offset: Number.parseInt(offset),
        },
        results_count: reservations.count,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
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
      // Audit log pour tentative de lecture échouée
      await auditService.log({
        userId: req.user.id,
        permission: "reservations.read",
        entityType: "reservation",
        entityId: id,
        action: "read",
        description: `Tentative de consultation d'une réservation inexistante`,
        changes: {
          reservation_id: id,
        },
        status: "failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      return res.status(404).json({
        status: 404,
        message: "Reservation not found",
      })
    }

    // Audit log pour lecture réussie
    await auditService.log({
      userId: req.user.id,
      permission: "reservations.read",
      entityType: "reservation",
      entityId: id,
      action: "read",
      description: `Réservation consultée (${reservation.reservation_number})`,
      changes: {
        reservation_number: reservation.reservation_number,
        payeur_name: reservation.payeur_name,
        status: reservation.status,
        total_price: reservation.total_price,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.json({
      status: 200,
      message: "Reservation retrieved",
      data: reservation,
    })
  },

  async create(req, res) {
    const { payeur_name, payeur_phone, payeur_email, pack_id, quantity, participants } = req.body

    // DEBUG: Vérifier si req.user existe
    console.log("[DEBUG] req.user:", req.user)
    console.log("[DEBUG] req.user.id:", req.user?.id)

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
        pack_name: pack.name,
        quantity,
        total_price,
        status: "pending",
        participants_count: participants?.length || 0,
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
      // Audit log pour tentative de modification échouée
      await auditService.log({
        userId: req.user.id,
        permission: "reservations.edit",
        entityType: "reservation",
        entityId: id,
        action: "update",
        description: `Tentative de modification d'une réservation inexistante`,
        changes: {
          reservation_id: id,
        },
        status: "failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      return res.status(404).json({
        status: 404,
        message: "Reservation not found",
      })
    }

    if (reservation.status === "ticket_generated") {
      // Audit log pour tentative de modification rejetée
      await auditService.log({
        userId: req.user.id,
        permission: "reservations.edit",
        entityType: "reservation",
        entityId: id,
        action: "update",
        description: `Tentative de modification d'une réservation avec ticket généré (refusée)`,
        changes: {
          reservation_number: reservation.reservation_number,
          status: reservation.status,
        },
        status: "failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

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
        description: `Réservation modifiée (${reservation.reservation_number})`,
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
      // Audit log pour tentative d'annulation échouée
      await auditService.log({
        userId: req.user.id,
        permission: "reservations.delete.soft",
        entityType: "reservation",
        entityId: id,
        action: "delete",
        description: `Tentative d'annulation d'une réservation inexistante`,
        changes: {
          reservation_id: id,
        },
        status: "failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      return res.status(404).json({
        status: 404,
        message: "Reservation not found",
      })
    }

    if (reservation.status === "ticket_generated") {
      // Audit log pour tentative d'annulation rejetée
      await auditService.log({
        userId: req.user.id,
        permission: "reservations.delete.soft",
        entityType: "reservation",
        entityId: id,
        action: "delete",
        description: `Tentative d'annulation d'une réservation avec ticket généré (refusée)`,
        changes: {
          reservation_number: reservation.reservation_number,
          status: reservation.status,
        },
        status: "failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      return res.status(409).json({
        status: 409,
        message: "Cannot cancel reservation after ticket generation",
      })
    }

    const previousStatus = reservation.status

    await reservation.update({ status: "cancelled" })

    logger.info(`Reservation cancelled: ${id}`)

    await auditService.log({
      userId: req.user.id,
      permission: "reservations.delete.soft",
      entityType: "reservation",
      entityId: id,
      action: "delete",
      description: `Réservation annulée (${reservation.reservation_number})`,
      changes: {
        reservation_number: reservation.reservation_number,
        payeur_name: reservation.payeur_name,
        previous_status: previousStatus,
        new_status: "cancelled",
        total_price: reservation.total_price,
        total_paid: reservation.total_paid,
      },
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
      // Audit log pour tentative de suppression échouée
      await auditService.log({
        userId: req.user.id,
        permission: "reservations.delete.permanent",
        entityType: "reservation",
        entityId: id,
        action: "delete",
        description: `Tentative de suppression d'une réservation inexistante`,
        changes: {
          reservation_id: id,
        },
        status: "failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      return res.status(404).json({
        status: 404,
        message: "Reservation not found",
      })
    }

    if (reservation.status === "ticket_generated") {
      // Audit log pour tentative de suppression rejetée
      await auditService.log({
        userId: req.user.id,
        permission: "reservations.delete.permanent",
        entityType: "reservation",
        entityId: id,
        action: "delete",
        description: `Tentative de suppression d'une réservation avec ticket généré (refusée)`,
        changes: {
          reservation_number: reservation.reservation_number,
          status: reservation.status,
        },
        status: "failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      return res.status(409).json({
        status: 409,
        message: "Cannot permanently delete reservation after ticket generation",
      })
    }

    try {
      const deletedReservationData = {
        reservation_number: reservation.reservation_number,
        payeur_name: reservation.payeur_name,
        payeur_email: reservation.payeur_email,
        total_price: reservation.total_price,
        total_paid: reservation.total_paid,
        status: reservation.status,
      }

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
        action: "delete",
        description: `Réservation supprimée définitivement (${deletedReservationData.reservation_number})`,
        changes: {
          ...deletedReservationData,
          deleted_related_data: {
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

      await auditService.log({
        userId: req.user.id,
        permission: "reservations.delete.permanent",
        entityType: "reservation",
        entityId: id,
        action: "delete",
        description: `Erreur lors de la suppression de la réservation`,
        changes: {
          error: error.message,
        },
        status: "failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      res.status(500).json({
        status: 500,
        message: `Erreur lors de la suppression de la réservation: ${error.message || "Une erreur est survenue"}`,
      })
    }
  },
}
