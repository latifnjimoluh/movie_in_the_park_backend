const express = require("express")
const { Ticket, Reservation, User } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { createTicket, generateQRDataUrl } = require("../services/ticketService")
const logger = require("../config/logger")
const path = require("path")
const fs = require("fs")
const jwt = require("jsonwebtoken")

const router = express.Router()

// ============================================
// UTILITAIRES
// ============================================

const buildUrl = (req, relativePath) => {
  if (!relativePath) return null
  if (/^https?:\/\//i.test(relativePath)) return relativePath
  const base = process.env.APP_URL || `${req.protocol}://${req.get("host")}`
  return `${base}${relativePath}`
}

const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3002",
  "http://localhost:3002",
  "http://localhost:3001",
]

const setCorsHeaders = (res, origin) => {
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS, POST")
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, Content-Length")
  }
}

// ============================================
// ENDPOINTS - Liste des tickets
// ============================================

router.get("/", verifyToken, checkPermission("tickets.view"), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10) || 1)
    const pageSize = Math.max(1, Number.parseInt(req.query.pageSize || "20", 10) || 20)
    const { q, status, packId, reservationId } = req.query

    const where = {}
    if (status) where.status = status
    if (reservationId) where.reservation_id = reservationId
    if (q) {
      const { Op } = require("sequelize")
      where.ticket_number = { [Op.iLike]: `%${q}%` }
    }

    const offset = (page - 1) * pageSize
    const limit = pageSize

    // ✅ MODIFICATION ICI - Inclure toutes les infos de la réservation
    const includeReservation = {
      association: "reservation",
      attributes: ["id", "payeur_name", "payeur_phone", "payeur_email", "pack_name_snapshot"],
    }
    if (packId) {
      includeReservation.where = { pack_id: packId }
    }

    const { count, rows } = await Ticket.findAndCountAll({
      where,
      include: [includeReservation],
      offset,
      limit,
      order: [["createdAt", "DESC"]],
    })

    const ticketsWithQR = await Promise.all(
      rows.map(async (ticket) => {
        let qr_data_url = null
        try {
          if (ticket.qr_payload) {
            let payload = ticket.qr_payload
            if (typeof payload === "string") {
              payload = JSON.parse(payload)
            }
            qr_data_url = await generateQRDataUrl(payload)
          }
        } catch (err) {
          logger.warn(`Failed to generate QR data URL for ticket ${ticket.id}:`, err)
          qr_data_url = null
        }

        return {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          status: ticket.status,
          qr_data_url,
          qr_image_url: buildUrl(req, ticket.qr_image_url),
          pdf_url: buildUrl(req, ticket.pdf_url),
          generated_at: ticket.generated_at,
          created_at: ticket.createdAt,
          // ✅ MODIFICATION ICI - Inclure l'objet reservation complet
          reservation: ticket.reservation
            ? {
                id: ticket.reservation.id,
                payeur_name: ticket.reservation.payeur_name,
                payeur_phone: ticket.reservation.payeur_phone,
                payeur_email: ticket.reservation.payeur_email,
                pack_name_snapshot: ticket.reservation.pack_name_snapshot,
              }
            : null,
        }
      }),
    )

    return res.json({
      status: 200,
      message: "Tickets retrieved",
      data: {
        tickets: ticketsWithQR,
        pagination: {
          total: count,
          page,
          pageSize: limit,
          totalPages: Math.ceil(count / limit),
        },
      },
    })
  } catch (err) {
    logger.error("Error fetching tickets:", err)
    return res.status(500).json({ status: 500, message: "Failed to fetch tickets" })
  }
})
// ============================================
// ENDPOINTS - Génération de token temporaire pour preview
// ============================================

router.options("/:id/preview-token", (req, res) => {
  const origin = req.headers.origin
  setCorsHeaders(res, origin)
  res.sendStatus(204)
})

router.post("/:id/preview-token", verifyToken, checkPermission("tickets.preview"), async (req, res) => {
  try {
    const { id } = req.params

    console.log("[Preview Token] Generating token for ticket:", id)

    // Vérifier que le ticket existe
    const ticket = await Ticket.findByPk(id)

    if (!ticket) {
      return res.status(404).json({
        status: 404,
        message: "Ticket not found",
      })
    }

    // Générer un token temporaire valable 5 minutes
    const previewToken = jwt.sign(
      {
        ticketId: id,
        userId: req.user.id,
        type: "preview",
      },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    )

    console.log("[Preview Token] Token generated successfully")

    res.json({
      status: 200,
      message: "Preview token generated",
      data: { previewToken },
    })
  } catch (err) {
    console.error("[Preview Token] Error:", err)
    logger.error("Error generating preview token:", err)
    res.status(500).json({
      status: 500,
      message: "Failed to generate preview token",
    })
  }
})

// ============================================
// ENDPOINTS - Prévisualisation (inline, pas de téléchargement)
// ============================================

router.options("/:id/preview", (req, res) => {
  const origin = req.headers.origin
  setCorsHeaders(res, origin)
  res.sendStatus(204)
})

router.get("/:id/preview", async (req, res) => {
  try {
    const { id } = req.params
    const { token } = req.query

    console.log("[Preview] Preview endpoint called - ticket id:", id)

    // CORS Headers
    const origin = req.headers.origin
    setCorsHeaders(res, origin)

    // ✅ Vérifier le token (depuis query string OU header)
    const authToken = token || req.headers.authorization?.replace("Bearer ", "")

    if (!authToken) {
      console.log("[Preview] No token provided")
      return res.status(401).json({
        status: 401,
        message: "Token manquant",
      })
    }

    // ✅ Valider le token
    try {
      const decoded = jwt.verify(authToken, process.env.JWT_SECRET)

      // Si c'est un token de preview, vérifier qu'il correspond au ticket
      if (decoded.type === "preview" && decoded.ticketId !== id) {
        console.log("[Preview] Token ticket ID mismatch")
        return res.status(403).json({
          status: 403,
          message: "Token invalide pour ce ticket",
        })
      }

      console.log("[Preview] Token valid for user:", decoded.userId || decoded.id)
    } catch (err) {
      console.error("[Preview] Token validation failed:", err.message)
      return res.status(401).json({
        status: 401,
        message: "Token invalide ou expiré",
      })
    }

    const ticket = await Ticket.findByPk(id)

    if (!ticket || !ticket.pdf_url) {
      return res.status(404).json({
        status: 404,
        message: "Ticket PDF not found",
      })
    }

    const pdfPath = path.join(process.cwd(), ticket.pdf_url.replace("/uploads/", "uploads/"))

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        status: 404,
        message: "PDF file not found on server",
      })
    }

    const stats = fs.statSync(pdfPath)
    console.log("[Preview] PDF file size:", stats.size, "bytes")

    // ✅ inline au lieu de attachment = pas de téléchargement forcé
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", "inline")
    res.setHeader("Content-Length", stats.size)
    res.setHeader("Cache-Control", "private, max-age=3600")

    console.log("[Preview] Streaming PDF for preview")

    const stream = fs.createReadStream(pdfPath)
    stream.pipe(res)

    stream.on("error", (err) => {
      console.error("[Preview] Stream error:", err)
      if (!res.headersSent) {
        res.status(500).json({ status: 500, message: "Error loading PDF preview" })
      }
    })
  } catch (err) {
    console.error("[Preview] Error:", err)
    logger.error("Error loading PDF preview:", err)

    const origin = req.headers.origin
    setCorsHeaders(res, origin)

    res.status(500).json({
      status: 500,
      message: "Failed to load PDF preview",
    })
  }
})

// ============================================
// ENDPOINTS - Téléchargement (attachment, force download)
// ============================================

router.options("/:id/download", (req, res) => {
  const origin = req.headers.origin
  setCorsHeaders(res, origin)
  res.sendStatus(204)
})

router.get("/:id/download", verifyToken, checkPermission("tickets.download"), async (req, res) => {
  try {
    const { id } = req.params
    console.log("[Download] Download endpoint called - ticket id:", id)

    // CORS Headers en premier
    const origin = req.headers.origin
    setCorsHeaders(res, origin)

    const ticket = await Ticket.findByPk(id)
    console.log("[Download] Ticket found:", ticket ? "yes" : "no")

    if (!ticket) {
      console.log("[Download] Ticket not found, returning 404")
      return res.status(404).json({
        status: 404,
        message: "Ticket not found",
      })
    }

    console.log("[Download] Ticket pdf_url:", ticket.pdf_url)

    if (!ticket.pdf_url) {
      console.log("[Download] No pdf_url on ticket")
      return res.status(404).json({
        status: 404,
        message: "PDF URL not found on ticket",
      })
    }

    const pdfPath = path.join(process.cwd(), ticket.pdf_url.replace("/uploads/", "uploads/"))
    console.log("[Download] PDF path from DB:", ticket.pdf_url)
    console.log("[Download] Resolved pdfPath:", pdfPath)

    if (!fs.existsSync(pdfPath)) {
      console.log("[Download] PDF file does not exist at:", pdfPath)
      return res.status(404).json({
        status: 404,
        message: "PDF file not found on server",
      })
    }

    console.log("[Download] PDF file exists")

    const stats = fs.statSync(pdfPath)
    console.log("[Download] File size:", stats.size, "bytes")

    // ✅ attachment = force le téléchargement
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(`ticket-${ticket.ticket_number}.pdf`)}`,
    )
    res.setHeader("Content-Length", stats.size)
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
    res.setHeader("Pragma", "no-cache")
    res.setHeader("Expires", "0")

    console.log("[Download] All headers set, starting stream")

    const stream = fs.createReadStream(pdfPath)
    stream.pipe(res)

    stream.on("error", (err) => {
      console.error("[Download] Stream error:", err)
      if (!res.headersSent) {
        res.status(500).json({ status: 500, message: "Error downloading PDF" })
      }
    })

    console.log("[Download] Stream piped")
  } catch (err) {
    console.error("[Download] Try/catch error:", err)
    logger.error("Error downloading ticket PDF:", err)

    const origin = req.headers.origin
    setCorsHeaders(res, origin)

    res.status(500).json({
      status: 500,
      message: "Failed to download ticket",
    })
  }
})

router.get("/:id/download-image", verifyToken, checkPermission("tickets.download"), async (req, res) => {
  try {
    const { id } = req.params

    const ticket = await Ticket.findByPk(id)
    if (!ticket) {
      return res.status(404).json({
        status: 404,
        message: "Ticket not found",
      })
    }

    const qrPath = path.join(process.cwd(), ticket.qr_image_url.replace("/uploads/", "uploads/"))

    if (!fs.existsSync(qrPath)) {
      return res.status(404).json({
        status: 404,
        message: "QR image not found",
      })
    }

    res.setHeader("Content-Type", "image/png")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(`qr-${ticket.ticket_number}.png`)}`,
    )
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
    res.setHeader("Pragma", "no-cache")
    res.setHeader("Expires", "0")

    res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "http://localhost:3000")
    res.setHeader("Access-Control-Allow-Credentials", "true")
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Type")

    const imageStream = fs.createReadStream(qrPath)
    imageStream.pipe(res)

    imageStream.on("error", (err) => {
      logger.error("Error streaming image:", err)
      if (!res.headersSent) {
        res.status(500).json({ status: 500, message: "Error downloading image" })
      }
    })
  } catch (err) {
    logger.error("Error downloading ticket image:", err)
    res.status(500).json({
      status: 500,
      message: "Failed to download image",
    })
  }
})

// ============================================
// ENDPOINTS - Génération de ticket
// ============================================

router.post("/:reservationId/generate", verifyToken, checkPermission("tickets.generate"), async (req, res) => {
  try {
    const { reservationId } = req.params

    if (!reservationId) {
      return res.status(400).json({
        status: 400,
        message: "Reservation ID is required in URL path",
      })
    }

    // Vérifier si le ticket existe déjà
    const existingTicket = await Ticket.findOne({
      where: { reservation_id: reservationId },
    })

    if (existingTicket) {
      let qr_data_url = null
      try {
        if (existingTicket.qr_payload) {
          const payload = JSON.parse(existingTicket.qr_payload)
          qr_data_url = await generateQRDataUrl(payload)
        }
      } catch (err) {
        logger.warn(`Failed to generate QR data URL for existing ticket ${existingTicket.id}:`, err)
      }

      return res.status(200).json({
        status: 200,
        message: "Ticket already exists",
        data: {
          ticket: {
            id: existingTicket.id,
            ticket_number: existingTicket.ticket_number,
            qr_data_url,
            qr_image_url: buildUrl(req, existingTicket.qr_image_url),
            pdf_url: buildUrl(req, existingTicket.pdf_url),
            status: existingTicket.status,
            generated_at: existingTicket.generated_at,
            created_at: existingTicket.createdAt,
          },
        },
      })
    }

    // Générer un nouveau ticket
    const result = await createTicket(reservationId, req.user.id)

    if (result && result.ticket) {
      result.ticket.qr_image_url = buildUrl(req, result.ticket.qr_image_url)
      result.ticket.pdf_url = buildUrl(req, result.ticket.pdf_url)
    }

    res.status(201).json({
      status: 201,
      message: "Ticket generated successfully",
      data: result,
    })
  } catch (err) {
    const status = err.status || 500
    const message = err.message || "Ticket generation failed"

    logger.error("Ticket generation error:", { status, message, error: err })

    res.status(status).json({
      status,
      message,
    })
  }
})

// ============================================
// ENDPOINTS - Récupération de tickets
// ============================================

router.get("/:id", verifyToken, checkPermission("tickets.view"), async (req, res) => {
  try {
    const { id } = req.params

    const ticket = await Ticket.findByPk(id, {
      include: [
        {
          association: "reservation",
          attributes: ["id", "payeur_name", "payeur_phone", "payeur_email", "pack_name_snapshot", "total_price"],
        },
        {
          association: "participants",
          attributes: ["id", "name", "email"],
        },
        {
          model: User,
          as: "generator",
          attributes: ["id", "name", "email"],
        },
      ],
    })

    if (!ticket) {
      return res.status(404).json({
        status: 404,
        message: "Ticket not found",
      })
    }

    let qr_data_url = null
    try {
      if (ticket.qr_payload) {
        const payload = JSON.parse(ticket.qr_payload)
        qr_data_url = await generateQRDataUrl(payload)
      }
    } catch (err) {
      logger.warn(`Failed to generate QR data URL for ticket ${ticket.id}:`, err)
    }

    res.json({
      status: 200,
      message: "Ticket retrieved",
      data: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: ticket.status,
        qr_data_url,
        qr_image_url: buildUrl(req, ticket.qr_image_url),
        pdf_url: buildUrl(req, ticket.pdf_url),
        generated_at: ticket.generated_at,
        created_at: ticket.createdAt,
        updated_at: ticket.updatedAt,
        reservation: ticket.reservation,
        participants: ticket.participants,
        generator: ticket.generator,
      },
    })
  } catch (err) {
    logger.error("Error fetching ticket:", err)
    res.status(500).json({
      status: 500,
      message: "Failed to fetch ticket",
    })
  }
})

router.get("/by-reservation/:reservationId", verifyToken, checkPermission("tickets.view"), async (req, res) => {
  try {
    const { reservationId } = req.params

    const ticket = await Ticket.findOne({
      where: { reservation_id: reservationId },
      include: [
        {
          association: "reservation",
          attributes: ["id", "payeur_name", "payeur_phone", "payeur_email", "pack_name_snapshot", "total_price"],
        },
        {
          association: "participants",
          attributes: ["id", "name", "email"],
        },
        {
          model: User,
          as: "generator",
          attributes: ["id", "name", "email"],
        },
      ],
    })

    if (!ticket) {
      return res.status(404).json({
        status: 404,
        message: "Ticket not found for this reservation",
      })
    }

    let qr_data_url = null
    try {
      if (ticket.qr_payload) {
        const payload = JSON.parse(ticket.qr_payload)
        qr_data_url = await generateQRDataUrl(payload)
      }
    } catch (err) {
      logger.warn(`Failed to generate QR data URL for ticket ${ticket.id}:`, err)
    }

    res.json({
      status: 200,
      message: "Ticket retrieved",
      data: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: ticket.status,
        qr_data_url,
        qr_image_url: buildUrl(req, ticket.qr_image_url),
        pdf_url: buildUrl(req, ticket.pdf_url),
        generated_at: ticket.generated_at,
        created_at: ticket.createdAt,
        updated_at: ticket.updatedAt,
        reservation: ticket.reservation,
        participants: ticket.participants,
        generator: ticket.generator,
      },
    })
  } catch (err) {
    logger.error("Error fetching ticket by reservation:", err)
    res.status(500).json({
      status: 500,
      message: "Failed to fetch ticket",
    })
  }
})

// ============================================
// ENDPOINTS - Régénération de ticket
// ============================================

router.post("/:id/regenerate", verifyToken, checkPermission("tickets.generate"), async (req, res) => {
  try {
    const { id } = req.params

    const ticket = await Ticket.findByPk(id, {
      include: [
        {
          association: "reservation",
          attributes: ["id", "total_paid", "total_price", "status"],
        },
      ],
    })

    if (!ticket) {
      return res.status(404).json({
        status: 404,
        message: "Ticket not found",
      })
    }

    if (ticket.reservation.total_paid < ticket.reservation.total_price) {
      return res.status(409).json({
        status: 409,
        message: "Reservation is not fully paid",
      })
    }

    let qr_data_url = null
    try {
      if (ticket.qr_payload) {
        const payload = JSON.parse(ticket.qr_payload)
        qr_data_url = await generateQRDataUrl(payload)
      }
    } catch (err) {
      logger.warn(`Failed to generate QR for regenerate:`, err)
    }

    res.json({
      status: 200,
      message: "Ticket regenerated successfully",
      data: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: ticket.status,
        qr_data_url,
        pdf_url: buildUrl(req, ticket.pdf_url),
      },
    })
  } catch (err) {
    logger.error("Error regenerating ticket:", err)
    res.status(500).json({
      status: 500,
      message: "Failed to regenerate ticket",
    })
  }
})

module.exports = router
