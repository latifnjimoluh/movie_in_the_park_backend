const express = require("express");
const multer = require("multer");
const { Payment } = require("../models");
const { verifyToken } = require("../middlewares/auth");
const { checkPermission } = require("../middlewares/permissions");
const { addPayment, deletePayment } = require("../services/paymentService");
const logger = require("../config/logger");

const router = express.Router();

/* ============================================================
   🟦 MULTER CONFIG : fichier optionnel, max 5 Mo
============================================================ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Seuls JPG, PNG ou PDF sont acceptés"));
  },
});

/* ============================================================
   🟦 GET PAYMENTS
============================================================ */
router.get("/", verifyToken, checkPermission("payments.view"), async (req, res) => {
  const { q, page = 1, pageSize = 20 } = req.query;

  let where = {};

  if (q) {
    const { Op } = require("sequelize");
    where = { [Op.or]: [{ method: { [Op.iLike]: `%${q}%` } }] };
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
    });

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
    });
  } catch (err) {
    logger.error("Get payments error:", err);
    res.status(500).json({ status: 500, message: "Failed to retrieve payments" });
  }
});

/* ============================================================
   🟦 ADD PAYMENT (fichier preuve optionnel)
============================================================ */
router.post(
  "/reservations/:reservation_id/payments",
  verifyToken,
  checkPermission("payments.add"),
  upload.single("proof"), // fichier optionnel
  async (req, res) => {
    const { reservation_id } = req.params;

    const { amount, method, comment } = req.body;

    logger.info("Incoming payment:", { reservation_id, amount, method, comment, file: req.file });

    // 🔎 validations
    if (!amount || !method) {
      return res.status(400).json({
        status: 400,
        message: "Amount and method are required",
      });
    }

    if (!/^\d+$/.test(amount)) {
      return res.status(400).json({
        status: 400,
        message: "Le montant doit contenir uniquement des chiffres",
      });
    }

    const validMethods = ["cash", "momo", "orange"];
    if (!validMethods.includes(method)) {
      return res.status(400).json({
        status: 400,
        message: "Méthode invalide (cash, momo, orange uniquement)",
      });
    }

    try {
      const result = await addPayment(
        reservation_id,
        {
          amount: Number(amount),
          method,
          comment,
        },
        req.user.id,
        req.file || null // <-- OPTIONNEL
      );

      res.status(201).json({
        status: 201,
        message: "Payment added successfully",
        data: result,
      });
    } catch (err) {
      logger.error("Add payment error:", err);
      res.status(err.status || 500).json({
        status: err.status || 500,
        message: err.message || "Payment failed",
      });
    }
  }
);

/* ============================================================
   🟦 DELETE PAYMENT
============================================================ */
router.delete(
  "/:reservation_id/:payment_id",
  verifyToken,
  checkPermission("payments.delete"),
  async (req, res) => {
    const { reservation_id, payment_id } = req.params;

    try {
      const result = await deletePayment(payment_id, reservation_id, req.user.id);

      res.json({ status: 200, message: "Payment deleted successfully", data: result });
    } catch (err) {
      logger.error("Delete payment error:", err);
      res.status(err.status || 500).json({
        status: err.status || 500,
        message: err.message || "Delete payment failed",
      });
    }
  }
);

module.exports = router;
