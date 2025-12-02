const express = require("express")
const multer = require("multer")
const { Payment } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { addPayment, deletePayment } = require("../services/paymentService")
const logger = require("../config/logger")

const router = express.Router()

// ✅ Configuration Multer pour l'upload de fichiers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"]
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Seuls les fichiers JPG, PNG et PDF sont acceptés"))
    }
  },
})

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

  try {
    const { count, rows } = await Payment.findAndCountAll({
      where,
      include: [
        { 
          association: "reservation", 
          attributes: ["id", "payeur_name", "payeur_phone"] 
        },
        { 
          association: "creator", 
          attributes: ["name", "role"] 
        },
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
  } catch (err) {
    logger.error("Get payments error:", err)
    res.status(500).json({
      status: 500,
      message: "Failed to retrieve payments",
    })
  }
})

// ---------------- ADD PAYMENT (avec upload de preuve) ----------------
router.post(
  "/reservations/:reservation_id/payments",
  verifyToken,
  checkPermission("payments.add"),
  upload.single("proof"), // ✅ Multer traite le fichier
  async (req, res) => {
    const { reservation_id } = req.params
    
    // ✅ Log COMPLET pour voir EXACTEMENT ce qui arrive
    logger.info("=== PAYMENT REQUEST DEBUG ===")
    logger.info("Headers:", req.headers)
    logger.info("Body:", req.body)
    logger.info("File:", req.file)
    logger.info("Params:", req.params)
    
    // ✅ IMPORTANT : Extraire les données du body (Multer les place dans req.body)
    const amount = req.body.amount
    const method = req.body.method
    const comment = req.body.comment

    logger.info("Extracted values:", {
      amount,
      method,
      comment,
      amountType: typeof amount,
      methodType: typeof method,
    })

    // ✅ Validation
    if (!amount || !method) {
      return res.status(400).json({
        status: 400,
        message: "Amount and method are required",
      })
    }

    // ✅ Validation du montant (seulement des chiffres)
    if (!/^\d+$/.test(amount)) {
      return res.status(400).json({
        status: 400,
        message: "Le montant doit contenir uniquement des chiffres",
      })
    }

    // ✅ Validation de la méthode
    const validMethods = ["cash", "momo", "orange"]
    if (!validMethods.includes(method)) {
      return res.status(400).json({
        status: 400,
        message: "Méthode de paiement invalide. Utilisez: cash, momo ou orange",
      })
    }

    try {
      const result = await addPayment(
        reservation_id,
        { 
          amount: Number.parseInt(amount), 
          method, 
          comment 
        },
        req.user.id,
        req.file // ✅ Fichier de preuve (optionnel)
      )

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
  }
)

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