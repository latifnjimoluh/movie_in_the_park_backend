const express = require("express")
const { Ticket, Reservation, User } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { createTicket, generateQRDataUrl } = require("../services/ticketService")
const logger = require("../config/logger")
const path = require("path")
const fs = require("fs")

const router = express.Router()

const buildUrl = (req, relativePath) => {
  if (!relativePath) return null
  if (/^https?:\/\//i.test(relativePath)) return relativePath
  const base = process.env.APP_URL || `${req.protocol}://${req.get("host")}`
  return `${base}${relativePath}`
}
// ---------------- GET ALL TICKETS ----------------
// Robust ticket list endpoint
router.get("/", verifyToken, checkPermission("tickets.view"), async (req, res) => {
  try {
    // Parse query params safely
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

    // Use safe offset/limit and a model-safe order field (use 'createdAt' or the correct column)
    const offset = (page - 1) * pageSize
    const limit = pageSize

    // Prefer explicit attributes for associations to avoid ambiguous SQL
    const includeReservation = {
      association: "reservation",
      attributes: ["id", "payeur_name", "payeur_phone", "pack_name_snapshot"],
    }
    if (packId) {
      includeReservation.where = { pack_id: packId }
    }

    // Run DB query
    const { count, rows } = await Ticket.findAndCountAll({
      where,
      include: [includeReservation],
      offset,
      limit,
      order: [["createdAt", "DESC"]], // <-- adjust to your model column if needed
    })

    // Generate QR data urls (safe) and build absolute urls
    const ticketsWithQR = await Promise.all(
      rows.map(async (ticket) => {
        let qr_data_url = null
        try {
          if (ticket.qr_payload) {
            // ticket.qr_payload could be stringified JSON or an object — handle both
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
    // Log full error for debugging
    logger.error("Error fetching tickets:", err)
    // Return minimal safe error to client
    return res.status(500).json({ status: 500, message: "Failed to fetch tickets" })
  }
})

// ---------------- GENERATE TICKET ----------------
router.post("/:reservationId/generate", verifyToken, checkPermission("tickets.generate"), async (req, res) => {
  try {
    const { reservationId } = req.params

    if (!reservationId) {
      return res.status(400).json({
        status: 400,
        message: "Reservation ID is required in URL path",
      })
    }

    // Check if ticket already exists
    const existingTicket = await Ticket.findOne({
      where: { reservation_id: reservationId },
    })

    if (existingTicket) {
      // Return existing ticket with QR data
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

    // Generate new ticket
    const result = await createTicket(reservationId, req.user.id)

    // Ensure returned URLs are absolute
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

// ---------------- GET TICKET BY ID ----------------
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
          attributes: ["id", "name", "email"], // Use 'name' instead of 'username'
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

// ---------------- REGENERATE TICKET ----------------
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

    // Generate new QR and PDF
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

// ---------------- GET TICKET BY RESERVATION ID ----------------
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
          attributes: ["id", "name", "email"], // Use 'name' instead of 'username'
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

// ---------------- STREAMING PDF DOWNLOAD ENDPOINT ----------------
router.get("/:id/download", verifyToken, checkPermission("tickets.view"), async (req, res) => {
  try {
    const { id } = req.params

    const ticket = await Ticket.findByPk(id)
    if (!ticket || !ticket.pdf_url) {
      return res.status(404).json({
        status: 404,
        message: "Ticket or PDF not found",
      })
    }

    const pdfPath = path.join(process.cwd(), "backend", ticket.pdf_url)

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        status: 404,
        message: "PDF file not found on server",
      })
    }

    // Get file size for Content-Length header
    const stats = fs.statSync(pdfPath)
    const fileSize = stats.size

    // Set headers for download (forces save dialog on mobile)
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="ticket-${ticket.ticket_number}.pdf"`)
    res.setHeader("Content-Length", fileSize)
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
    res.setHeader("Pragma", "no-cache")
    res.setHeader("Expires", "0")

    // Stream the file for better performance on mobile
    const pdfStream = fs.createReadStream(pdfPath)
    pdfStream.pipe(res)

    pdfStream.on("error", (err) => {
      logger.error("Error streaming PDF:", err)
      if (!res.headersSent) {
        res.status(500).json({ status: 500, message: "Error downloading PDF" })
      }
    })
  } catch (err) {
    logger.error("Error downloading ticket:", err)
    res.status(500).json({
      status: 500,
      message: "Failed to download ticket",
    })
  }
})

// ---------------- IMAGE CONVERSION ENDPOINT FOR ANDROID GALLERY SAVE ----------------
router.get("/:id/download-image", verifyToken, checkPermission("tickets.view"), async (req, res) => {
  try {
    const { id } = req.params

    const ticket = await Ticket.findByPk(id)
    if (!ticket) {
      return res.status(404).json({
        status: 404,
        message: "Ticket not found",
      })
    }

    const qrPath = path.join(process.cwd(), "backend", ticket.qr_image_url)

    if (!fs.existsSync(qrPath)) {
      return res.status(404).json({
        status: 404,
        message: "QR image not found",
      })
    }

    res.setHeader("Content-Type", "image/png")
    res.setHeader("Content-Disposition", `attachment; filename="qr-${ticket.ticket_number}.png"`)
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")

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

module.exports = router
