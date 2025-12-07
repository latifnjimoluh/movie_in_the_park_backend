const express = require("express")
const multer = require("multer")
const { Payment } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { addPayment, deletePayment } = require("../services/paymentService")
const logger = require("../config/logger")
const auditService = require("../services/auditService")

const router = express.Router()

/* ============================================================
   🟦 MULTER CONFIG : fichier optionnel, max 5 Mo
============================================================ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"]
    if (allowedTypes.includes(file.mimetype)) cb(null, true)
    else cb(new Error("Seuls JPG, PNG ou PDF sont acceptés"))
  },
})

/* ============================================================
   🟦 GET PAYMENTS
============================================================ */
router.get("/", verifyToken, checkPermission("payments.view"), async (req, res) => {
  const { q, page = 1, pageSize = 20 } = req.query

  let where = {}

  if (q) {
    const { Op } = require("sequelize")
    where = { [Op.or]: [{ method: { [Op.iLike]: `%${q}%` } }] }
  }

  try {
    const { count, rows } = await Payment.findAndCountAll({
      where,
      include: [
        { association: "reservation", attributes: ["id", "payeur_name", "payeur_phone"] },
        { association: "creator", attributes: ["name", "role"] },
      ],
      offset: (page - 1) * pageSize,
      limit: Number(pageSize),
      order: [["createdAt", "DESC"]],
    })

    res.json({
      status: 200,
      message: "Payments retrieved",
      data: {
        payments: rows,
        pagination: {
          total: count,
          page: Number(page),
          pageSize: Number(pageSize),
          totalPages: Math.ceil(count / pageSize),
        },
      },
    })
  } catch (err) {
    logger.error("Get payments error:", err)
    res.status(500).json({ status: 500, message: "Failed to retrieve payments" })
  }
})

/* ============================================================
   🟦 ADD PAYMENT (fichier preuve optionnel)
============================================================ */
router.post(
  "/reservations/:reservation_id/payments",
  verifyToken,
  checkPermission("payments.create"),
  upload.single("proof"), // fichier optionnel
  async (req, res) => {
    const { reservation_id } = req.params
    const { amount, method, comment } = req.body

    // 🔎 Vérification de l'utilisateur
    if (!req.user || !req.user.id) {
      logger.error("User ID missing in payment creation request")
      return res.status(401).json({
        status: 401,
        message: "User not authenticated",
      })
    }

    logger.info("Incoming payment:", { 
      reservation_id, 
      amount, 
      method, 
      comment, 
      file: req.file,
      userId: req.user.id 
    })

    // 🔎 Validations
    if (!amount || !method) {
      return res.status(400).json({
        status: 400,
        message: "Amount and method are required",
      })
    }

    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      return res.status(400).json({
        status: 400,
        message: "Le montant doit être un nombre valide",
      })
    }

    const numAmount = Number(amount)
    if (numAmount <= 0) {
      return res.status(400).json({
        status: 400,
        message: "Le montant doit être supérieur à zéro",
      })
    }

    const validMethods = ["cash", "momo", "orange"]
    if (!validMethods.includes(method)) {
      return res.status(400).json({
        status: 400,
        message: "Méthode invalide (cash, momo, orange uniquement)",
      })
    }

    try {
      // Ajout du paiement
      const result = await addPayment(
        reservation_id,
        {
          amount: numAmount,
          method,
          comment: comment?.trim() || null,
        },
        req.user.id,
        req.file || null,
      )

      // 📝 Audit log en cas de succès
      console.log("[AUDIT] Tentative de log pour payment.create:", {
        userId: req.user.id,
        paymentId: result.payment.id,
        amount: numAmount,
        method,
      })

      const auditLog = await auditService.log({
        userId: req.user.id,
        permission: "payments.create",
        entityType: "payment",
        entityId: result.payment.id,
        action: "create",
        description: `Paiement de ${numAmount} XAF ajouté (${method})`,
        changes: {
          reservation_id,
          amount: numAmount,
          method,
          comment: comment?.trim() || null,
          hasProof: !!req.file,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      if (!auditLog) {
        logger.error("[AUDIT] ❌ Audit log failed to save for payment creation", {
          userId: req.user.id,
          paymentId: result.payment.id,
          reservation_id,
        })
      } else {
        console.log("[AUDIT] ✅ Log sauvegardé avec succès:", auditLog.id)
      }

      return res.status(201).json({
        status: 201,
        message: "Payment added successfully",
        data: result,
      })
    } catch (err) {
      // 📝 Audit log en cas d'erreur
      console.log("[AUDIT] Tentative de log pour erreur payment.create:", {
        userId: req.user.id,
        error: err.message,
      })

      const errorLog = await auditService.log({
        userId: req.user.id,
        permission: "payments.create",
        entityType: "payment",
        entityId: null,
        action: "create",
        description: `Erreur lors de l'ajout du paiement: ${err.message}`,
        changes: {
          reservation_id,
          amount: numAmount,
          method,
          comment: comment?.trim() || null,
          error: err.message,
        },
        status: "failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      if (!errorLog) {
        logger.error("[AUDIT] ❌ Audit log failed to save for payment error", {
          userId: req.user.id,
          error: err.message,
        })
      }

      logger.error("Add payment error:", err)
      return res.status(err.status || 500).json({
        status: err.status || 500,
        message: err.message || "Payment failed",
      })
    }
  },
)

/* ============================================================
   🟦 DELETE PAYMENT
============================================================ */
router.delete(
  "/:reservation_id/:payment_id", 
  verifyToken, 
  checkPermission("payments.delete"), 
  async (req, res) => {
    const { reservation_id, payment_id } = req.params

    // 🔎 Vérification de l'utilisateur
    if (!req.user || !req.user.id) {
      logger.error("User ID missing in payment deletion request")
      return res.status(401).json({
        status: 401,
        message: "User not authenticated",
      })
    }

    try {
      const result = await deletePayment(payment_id, reservation_id, req.user.id)

      // 📝 Audit log en cas de succès
      console.log("[AUDIT] Tentative de log pour payment.delete:", {
        userId: req.user.id,
        paymentId: payment_id,
      })

      const auditLog = await auditService.log({
        userId: req.user.id,
        permission: "payments.delete",
        entityType: "payment",
        entityId: payment_id,
        action: "delete",
        description: `Paiement supprimé (réservation: ${reservation_id})`,
        changes: {
          reservation_id,
          amount_deleted: result.reservation.total_paid - result.reservation.remaining_amount,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      if (!auditLog) {
        logger.error("[AUDIT] ❌ Audit log failed to save for payment deletion", {
          userId: req.user.id,
          paymentId: payment_id,
        })
      } else {
        console.log("[AUDIT] ✅ Log sauvegardé avec succès:", auditLog.id)
      }

      return res.json({ 
        status: 200, 
        message: "Payment deleted successfully", 
        data: result 
      })
    } catch (err) {
      // 📝 Audit log en cas d'erreur
      const errorLog = await auditService.log({
        userId: req.user.id,
        permission: "payments.delete",
        entityType: "payment",
        entityId: payment_id,
        action: "delete",
        description: `Erreur lors de la suppression du paiement: ${err.message}`,
        changes: {
          reservation_id,
          error: err.message,
        },
        status: "failed",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      if (!errorLog) {
        logger.error("[AUDIT] ❌ Audit log failed to save for payment deletion error", {
          userId: req.user.id,
          paymentId: payment_id,
        })
      }

      logger.error("Delete payment error:", err)
      return res.status(err.status || 500).json({
        status: err.status || 500,
        message: err.message || "Delete payment failed",
      })
    }
  }
)

module.exports = router
