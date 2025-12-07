const express = require("express")
const { Reservation, Participant, Pack, Payment, sequelize } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { validate, createReservationSchema } = require("../middlewares/validation")
const { addPayment } = require("../services/paymentService")
const { sendPayerEmail, sendParticipantEmail, sendAdminNotificationEmail } = require("../services/emailService")
const logger = require("../config/logger")
const auditService = require("../services/auditService")
const uploadPaymentProof = require("../middlewares/uploadPaymentProof")

const router = express.Router()

/* ============================================================
   🛡️ PROTECTION ANTI-DOUBLON GLOBAL
============================================================ */
const requestsInProgress = new Map() // Stocke les requêtes en cours par fingerprint

function generateRequestFingerprint(body) {
  // Crée une empreinte unique basée sur les données de la réservation
  return JSON.stringify({
    payeur_name: body.payeur_name,
    payeur_phone: body.payeur_phone,
    pack_id: body.pack_id,
    timestamp: Math.floor(Date.now() / 10000), // Fenêtre de 10 secondes
  })
}

function preventDuplicateRequest(req, res, next) {
  const fingerprint = generateRequestFingerprint(req.validatedData || req.body)
  
  logger.info(`🔍 Request fingerprint: ${fingerprint}`)
  
  if (requestsInProgress.has(fingerprint)) {
    logger.warn(`⚠️ DUPLICATE REQUEST DETECTED - Blocking duplicate reservation creation`)
    return res.status(409).json({
      status: 409,
      message: "A reservation with the same details is already being processed. Please wait.",
    })
  }
  
  // Marquer la requête comme en cours
  requestsInProgress.set(fingerprint, Date.now())
  logger.info(`✅ Request marked as in progress: ${fingerprint}`)
  
  // Nettoyer après 15 secondes
  setTimeout(() => {
    requestsInProgress.delete(fingerprint)
    logger.info(`🧹 Request fingerprint cleaned: ${fingerprint}`)
  }, 15000)
  
  next()
}

/* ============================================================
   🔧 FONCTION HELPER: ENVOI DES EMAILS
============================================================ */
async function sendReservationEmails(fullReservation, participants, pack, payeur_email) {
  const reservationId = fullReservation.id
  logger.info(`📧 Starting email send process for reservation ${reservationId}`)

  try {
    // ➤ SEND EMAIL TO PAYER (if email exists)
    if (payeur_email && typeof payeur_email === "string" && payeur_email.trim() !== "") {
      logger.info(`📧 Sending email to payer: ${payeur_email}`)
      await sendPayerEmail(fullReservation, participants || [], pack)
      logger.info(`✅ Email sent to payer: ${payeur_email}`)
    }

    // ➤ SEND EMAIL TO PARTICIPANTS WITH EMAIL
    if (participants && participants.length > 0) {
      const participantsWithEmail = participants.filter(
        (p) => p.email && typeof p.email === "string" && p.email.trim() !== "",
      )

      for (const participant of participantsWithEmail) {
        logger.info(`📧 Sending email to participant: ${participant.email}`)
        await sendParticipantEmail(participant, fullReservation, pack)
        logger.info(`✅ Email sent to participant: ${participant.email}`)
      }
    }

    // ➤ SEND ADMIN NOTIFICATION EMAIL
    const adminEmails = [process.env.ADMIN_NOTIFICATION_EMAIL, process.env.ADMIN_NOTIFICATION_EMAIL_2].filter(
      (email) => email && typeof email === "string" && email.trim() !== "",
    )

    if (adminEmails.length > 0) {
      logger.info(`📧 Sending admin notification to: ${adminEmails.join(", ")}`)
      await sendAdminNotificationEmail(fullReservation, participants || [], pack, adminEmails)
      logger.info(`✅ Admin notification sent`)
    }

    logger.info(`✅ All emails sent successfully for reservation ${reservationId}`)
  } catch (emailErr) {
    logger.error(`❌ Email sending failed for reservation ${reservationId}:`, emailErr.message)
  }
}

/* ============================================================
   📌 CREATE RESERVATION - PUBLIC (pour les clients)
============================================================ */
router.post("/public", validate(createReservationSchema), preventDuplicateRequest, async (req, res) => {
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("🔵 PUBLIC ROUTE CALLED - POST /public")
  logger.info(`📦 Request body: ${JSON.stringify(req.validatedData)}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  
  const t = await sequelize.transaction()

  try {
    const { payeur_name, payeur_phone, payeur_email, pack_id, quantity, participants } = req.validatedData

    const pack = await Pack.findByPk(pack_id, { transaction: t })

    if (!pack) {
      await t.rollback()
      return res.status(404).json({ status: 404, message: "Pack not found" })
    }

    if (!pack.is_active) {
      await t.rollback()
      return res.status(400).json({
        status: 400,
        message: "Pack is no longer available",
      })
    }

    const total_price = pack.price

    // ---------- CREATE RESERVATION ----------
    logger.info("💾 Creating reservation in database...")
    const reservation = await Reservation.create(
      {
        payeur_name,
        payeur_phone,
        payeur_email: payeur_email || null,
        pack_id,
        pack_name_snapshot: pack.name,
        unit_price: pack.price,
        quantity,
        total_price,
        status: "pending",
      },
      { transaction: t },
    )
    logger.info(`✅ Reservation created with ID: ${reservation.id}`)

    // ---------- CREATE PARTICIPANTS ----------
    if (participants && participants.length > 0) {
      logger.info(`👥 Creating ${participants.length} participants...`)
      for (const p of participants) {
        await Participant.create(
          {
            reservation_id: reservation.id,
            name: p.name,
            email: p.email || null,
            phone: p.phone || null,
          },
          { transaction: t },
        )
      }
      logger.info(`✅ Participants created`)
    }

    // Reload full object with participants
    const fullReservation = await Reservation.findByPk(reservation.id, {
      include: [{ association: "participants" }],
      transaction: t,
    })

    await t.commit()

    logger.info(`✅ Transaction committed for reservation ${reservation.id}`)

    await auditService.log({
      userId: "02ae193b-0f63-42df-b039-d984998f0d2a", // Fixed system user ID
      permission: "public.reservation.create",
      entityType: "reservation",
      entityId: reservation.id,
      action: "create",
      description: `Réservation publique créée pour ${payeur_name} - Forfait: ${pack.name}`,
      changes: {
        payeur_name,
        payeur_phone,
        payeur_email: payeur_email || null,
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

    /* ============================================================
       📩 SEND EMAILS (ASYNC — DOES NOT BLOCK RESPONSE)
    ============================================================ */
    setImmediate(() => {
      sendReservationEmails(fullReservation, participants, pack, payeur_email)
    })

    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info(`✅ PUBLIC ROUTE COMPLETED - Reservation ${reservation.id}`)
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    return res.status(201).json({
      status: 201,
      message: "Reservation created",
      data: { reservation: fullReservation },
    })
  } catch (error) {
    await t.rollback()
    logger.error(`❌ Error creating public reservation: ${error.message}`)
    logger.error(`Stack trace: ${error.stack}`)

    await auditService.log({
      userId: null,
      permission: "public.reservation.create",
      entityType: "reservation",
      entityId: "unknown",
      action: "create",
      description: `Erreur lors de la création de réservation publique`,
      changes: { error: error.message },
      status: "failed",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    return res.status(500).json({
      status: 500,
      message: "Error creating reservation",
    })
  }
})

/* ============================================================
   📌 GET ALL RESERVATIONS
============================================================ */
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

/* ============================================================
   📌 CREATE RESERVATION (ADMIN) — emails envoyés APRÈS la réponse
============================================================ */
router.post(
  "/",
  verifyToken,
  checkPermission("reservations.create"),
  validate(createReservationSchema),
  preventDuplicateRequest,
  async (req, res) => {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info("🟢 ADMIN ROUTE CALLED - POST /")
    logger.info(`📦 Request body: ${JSON.stringify(req.validatedData)}`)
    logger.info(`👤 User: ${req.user.id}`)
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    
    const t = await sequelize.transaction()

    try {
      const { payeur_name, payeur_phone, payeur_email, pack_id, quantity, participants } = req.validatedData

      const pack = await Pack.findByPk(pack_id, { transaction: t })

      if (!pack) {
        await t.rollback()
        return res.status(404).json({ status: 404, message: "Pack not found" })
      }

      if (!pack.is_active) {
        await t.rollback()
        return res.status(400).json({
          status: 400,
          message: "Pack is no longer available",
        })
      }

      const total_price = pack.price

      // ---------- CREATE RESERVATION ----------
      logger.info("💾 Creating reservation in database...")
      const reservation = await Reservation.create(
        {
          payeur_name,
          payeur_phone,
          payeur_email: payeur_email || null,
          pack_id,
          pack_name_snapshot: pack.name,
          unit_price: pack.price,
          quantity,
          total_price,
          status: "pending",
        },
        { transaction: t },
      )
      logger.info(`✅ Reservation created with ID: ${reservation.id}`)

      // ---------- CREATE PARTICIPANTS ----------
      if (participants && participants.length > 0) {
        logger.info(`👥 Creating ${participants.length} participants...`)
        for (const p of participants) {
          await Participant.create(
            {
              reservation_id: reservation.id,
              name: p.name,
              email: p.email || null,
              phone: p.phone || null,
            },
            { transaction: t },
          )
        }
        logger.info(`✅ Participants created`)
      }

      // Reload full object with participants
      const fullReservation = await Reservation.findByPk(reservation.id, {
        include: [{ association: "participants" }],
        transaction: t,
      })

      await t.commit()

      logger.info(`✅ Transaction committed for reservation ${reservation.id}`)

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
          payeur_email: payeur_email || null,
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

      /* ============================================================
       📩 SEND EMAILS (ASYNC — DOES NOT BLOCK RESPONSE)
    ============================================================ */
      setImmediate(() => {
        sendReservationEmails(fullReservation, participants, pack, payeur_email)
      })

      logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      logger.info(`✅ ADMIN ROUTE COMPLETED - Reservation ${reservation.id}`)
      logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

      /* ============================================================
       📌 IMMEDIATE RESPONSE TO FRONTEND (NO WAITING FOR EMAILS)
    ============================================================ */
      return res.status(201).json({
        status: 201,
        message: "Reservation created",
        data: { reservation: fullReservation },
      })
    } catch (error) {
      await t.rollback()
      logger.error(`❌ Error creating admin reservation: ${error.message}`)
      logger.error(`Stack trace: ${error.stack}`)

      await auditService.log({
        userId: req.user.id,
        permission: "reservations.create",
        entityType: "reservation",
        entityId: "unknown",
        action: "create",
        description: `Erreur lors de la création de réservation`,
        changes: { error: error.message },
        status: "failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      return res.status(500).json({
        status: 500,
        message: "Error creating reservation",
      })
    }
  },
)

/* ============================================================
   📌 GET ONE RESERVATION
============================================================ */
router.get("/:id", verifyToken, checkPermission("reservations.view"), async (req, res) => {
  const reservation = await Reservation.findByPk(req.params.id, {
    include: [
      { association: "participants" },
      { association: "payments", include: [{ association: "creator", attributes: ["name", "email"] }] },
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

/* ============================================================
   📌 EDIT RESERVATION (UPDATE STATUS)
============================================================ */
router.put("/:id/status", verifyToken, checkPermission("reservations.edit.status"), async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  try {
    const reservation = await Reservation.findByPk(id)

    if (!reservation) {
      return res.status(404).json({
        status: 404,
        message: "Reservation not found",
      })
    }

    const previousStatus = reservation.status
    await reservation.update({ status })

    logger.info(`Reservation status updated: ${id} from ${previousStatus} to ${status}`)

    await auditService.log({
      userId: req.user.id,
      permission: "reservations.edit.status",
      entityType: "reservation",
      entityId: id,
      action: "update",
      description: `Statut de réservation modifié de ${previousStatus} à ${status}`,
      changes: {
        reservation_number: reservation.reservation_number,
        previous_status: previousStatus,
        new_status: status,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.json({
      status: 200,
      message: "Reservation status updated",
      data: { reservation },
    })
  } catch (error) {
    logger.error(`Error updating reservation status: ${error.message}`)

    await auditService.log({
      userId: req.user.id,
      permission: "reservations.edit.status",
      entityType: "reservation",
      entityId: id,
      action: "update",
      description: `Erreur lors de la modification du statut de réservation`,
      changes: { error: error.message },
      status: "failed",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.status(500).json({
      status: 500,
      message: "Error updating reservation status",
    })
  }
})

/* ============================================================
   📌 ADD PAYMENT
============================================================ */
router.post(
  "/:id/payments",
  verifyToken,
  checkPermission("payments.create"),
  uploadPaymentProof.single("proof"),
  async (req, res) => {
    const { amount, method, comment } = req.body

    try {
      const result = await addPayment(req.params.id, { amount, method, comment }, req.user.id, req.file)

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
  },
)

/* ============================================================
   📌 DELETE RESERVATION (soft delete)
============================================================ */
router.delete("/:id", verifyToken, checkPermission("reservations.delete.soft"), async (req, res) => {
  const { id } = req.params

  try {
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
        message: "Cannot delete reservation after ticket generation",
      })
    }

    const previousStatus = reservation.status

    await reservation.update({ status: "cancelled" })

    logger.info(`Reservation deleted/cancelled: ${id}`)

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
        payeur_email: reservation.payeur_email,
        total_price: reservation.total_price,
        total_paid: reservation.total_paid,
        previous_status: previousStatus,
        new_status: "cancelled",
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.json({
      status: 200,
      message: "Reservation successfully cancelled",
      data: { reservation },
    })
  } catch (error) {
    logger.error(`Error deleting reservation: ${error.message}`)

    await auditService.log({
      userId: req.user.id,
      permission: "reservations.delete.soft",
      entityType: "reservation",
      entityId: id,
      action: "delete",
      description: `Erreur lors de l'annulation de réservation`,
      changes: {
        error: error.message,
      },
      status: "failed",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.status(500).json({
      status: 500,
      message: "Error deleting reservation",
    })
  }
})

/* ============================================================
   📌 DELETE RESERVATION PERMANENTLY (SUPERADMIN ONLY)
============================================================ */
router.delete("/:id/permanent", verifyToken, checkPermission("reservations.delete.permanent"), async (req, res) => {
  const { id } = req.params
  const t = await sequelize.transaction()

  try {
    const reservation = await Reservation.findByPk(id, { transaction: t })

    if (!reservation) {
      await t.rollback()
      return res.status(404).json({
        status: 404,
        message: "Reservation not found",
      })
    }

    if (reservation.status === "ticket_generated") {
      await t.rollback()
      return res.status(409).json({
        status: 409,
        message: "Cannot permanently delete reservation after ticket generation",
      })
    }

    const deletedReservationData = {
      reservation_number: reservation.reservation_number,
      payeur_name: reservation.payeur_name,
      payeur_email: reservation.payeur_email,
      total_price: reservation.total_price,
      total_paid: reservation.total_paid,
      status: reservation.status,
    }

    // Count related records before deletion
    const paymentsCount = await Payment.count({ where: { reservation_id: id }, transaction: t })
    const participantsCount = await Participant.count({ where: { reservation_id: id }, transaction: t })

    await Payment.destroy({ where: { reservation_id: id }, transaction: t })
    await Participant.destroy({ where: { reservation_id: id }, transaction: t })

    await Reservation.destroy({ where: { id }, transaction: t })

    await t.commit()

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
          payments: paymentsCount,
          participants: participantsCount,
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
    await t.rollback()
    logger.error(`Error permanently deleting reservation: ${error.message}`)

    await auditService.log({
      userId: req.user.id,
      permission: "reservations.delete.permanent",
      entityType: "reservation",
      entityId: id,
      action: "delete",
      description: `Erreur lors de la suppression définitive de réservation`,
      changes: {
        error: error.message,
      },
      status: "failed",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.status(500).json({
      status: 500,
      message: "Error permanently deleting reservation",
    })
  }
})

module.exports = router