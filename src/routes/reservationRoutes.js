const express = require("express")
const { Reservation, Participant, Pack, Payment, sequelize } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { validate, createReservationSchema } = require("../middlewares/validation")
const { addPayment } = require("../services/paymentService")
const { sendPayerEmail, sendParticipantEmail } = require("../services/emailService")
const logger = require("../config/logger")
const uploadPaymentProof = require("../middlewares/uploadPaymentProof")

const router = express.Router()

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
   📌 CREATE RESERVATION — emails envoyés APRÈS la réponse
============================================================ */
router.post("/", validate(createReservationSchema), async (req, res) => {
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

    // ---------- CREATE PARTICIPANTS ----------
    if (participants && participants.length > 0) {
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
    }

    // Reload full object with participants
    const fullReservation = await Reservation.findByPk(reservation.id, {
      include: [{ association: "participants" }],
      transaction: t,
    })

    await t.commit()

    logger.info(`Reservation created: ${reservation.id}`)

    /* ============================================================
       📩 SEND EMAILS (ASYNC — DOES NOT BLOCK RESPONSE)
    ============================================================ */

    setImmediate(async () => {
      try {
        // ➤ SEND EMAIL TO PAYER (if email exists)
        if (payeur_email && typeof payeur_email === "string" && payeur_email.trim() !== "") {
          await sendPayerEmail(fullReservation, participants || [], pack)
        }

        // ➤ SEND EMAIL TO PARTICIPANTS WITH EMAIL
        if (participants && participants.length > 0) {
          const participantsWithEmail = participants.filter(
            (p) => p.email && typeof p.email === "string" && p.email.trim() !== "",
          )

          for (const participant of participantsWithEmail) {
            await sendParticipantEmail(participant, fullReservation, pack)
          }
        }
      } catch (emailErr) {
        logger.warn("Async email sending failed:", emailErr.message)
      }
    })

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
    logger.error(`Error creating reservation: ${error.message}`)

    return res.status(500).json({
      status: 500,
      message: "Error creating reservation",
    })
  }
})

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
   📌 ADD PAYMENT
============================================================ */
router.post(
  "/:id/payments",
  verifyToken,
  checkPermission("payments.add"),
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

module.exports = router
