const fs = require("fs")
const path = require("path")
const QRCode = require("qrcode")
const PDFDocument = require("pdfkit")
const { v4: uuidv4 } = require("uuid")
const { sequelize } = require("../models")
const { Ticket, Reservation, ActionLog, Participant } = require("../models")
const { generateQRPayload } = require("../utils/hmac")
const logger = require("../config/logger")

const UPLOADS_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads")

const TICKET_TEMPLATES = {
  "VIP Soolouf": "/images/vip.jpg",
  "Simple Soolouf": "/images/simple.jpg",
  "Famille Soolouf": "/images/famille.jpg",
  "Couple Soolouf": "/images/couple.jpg",
}

const QR_POSITIONS = {
  "VIP Soolouf": { x: 990, y: 80, width: 150 },
  "Simple Soolouf": { x: 990, y: 80, width: 150 },
  "Famille Soolouf": { x: 990, y: 80, width: 150 },
  "Couple Soolouf": { x: 990, y: 80, width: 150 },
}

// Resolve a template key from a pack name by trying exact, case-insensitive
// and alias matches. Returns a key present in TICKET_TEMPLATES.
const TEMPLATE_ALIASES = [
  { key: "VIP Soolouf", aliases: ["vip"] },
  { key: "Simple Soolouf", aliases: ["simple"] },
  { key: "Famille Soolouf", aliases: ["famille", "family"] },
  { key: "Couple Soolouf", aliases: ["couple"] },
]

const resolveTemplateKey = (packName) => {
  if (!packName || typeof packName !== "string") return "Simple Soolouf"
  const normalized = packName.trim().toLowerCase()

  // Direct match against keys
  for (const k of Object.keys(TICKET_TEMPLATES)) {
    if (k.toLowerCase() === normalized) return k
  }

  // Match using aliases or substring
  for (const entry of TEMPLATE_ALIASES) {
    if (entry.key.toLowerCase() === normalized) return entry.key
    for (const a of entry.aliases) {
      if (normalized.includes(a) || entry.key.toLowerCase().includes(normalized)) return entry.key
    }
  }

  // Fallback: try to find any template whose key contains the normalized name
  for (const k of Object.keys(TICKET_TEMPLATES)) {
    if (k.toLowerCase().includes(normalized) || normalized.includes(k.toLowerCase())) return k
  }

  return "Simple Soolouf"
}

const ensureUploadsDir = () => {
  ;[UPLOADS_DIR, path.join(UPLOADS_DIR, "qr"), path.join(UPLOADS_DIR, "tickets")].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  })
}

const generateTicketNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `MIP-${timestamp}-${random}`
}

const generateQRDataUrl = async (payload) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
      width: 300,
      margin: 2,
      color: { dark: "#000", light: "#fff" },
    })
    return qrDataUrl
  } catch (err) {
    logger.error("QR generation error:", err)
    throw { status: 500, message: "Failed to generate QR code" }
  }
}

const generateQRImage = async (payload) => {
  ensureUploadsDir()
  const qrPath = path.join(UPLOADS_DIR, "qr", `${payload.ticket_number}.png`)

  try {
    await QRCode.toFile(qrPath, JSON.stringify(payload), {
      width: 300,
      margin: 2,
      color: { dark: "#000", light: "#fff" },
    })

    return `/uploads/qr/${payload.ticket_number}.png`
  } catch (err) {
    logger.error("QR generation error:", err)
    throw { status: 500, message: "Failed to generate QR code" }
  }
}

const generateTicketPDFWithImage = async (reservation, ticketNumber, qrImageUrl, packName) => {
  ensureUploadsDir()
  const pdfPath = path.join(UPLOADS_DIR, "tickets", `${ticketNumber}.pdf`)

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [1280, 400], margin: 0 })
      const stream = fs.createWriteStream(pdfPath)

      doc.pipe(stream)

      // Determine the template key for this pack (avoid defaulting everything to Simple)
      const templateKey = resolveTemplateKey(packName)
      const templateUrl = TICKET_TEMPLATES[templateKey] || TICKET_TEMPLATES["Simple Soolouf"]
      const qrPosition = QR_POSITIONS[templateKey] || QR_POSITIONS["Simple Soolouf"]

      // Download or read and embed the template image
      try {
        let imageBuffer = null

        // If templateUrl is a local path (starts with '/'), try to read from filesystem first.
        if (templateUrl && templateUrl.startsWith("/")) {
          // Try several candidate locations: project root + templateUrl, UPLOADS_DIR + relative
          const candidates = [
            path.join(process.cwd(), templateUrl),
            path.join(UPLOADS_DIR, templateUrl.replace(/^\/uploads\/?/, "")),
            path.join(__dirname, "..", "..", templateUrl.replace(/^\//, "")),
          ]

          for (const p of candidates) {
            if (fs.existsSync(p)) {
              imageBuffer = fs.readFileSync(p)
              break
            }
          }
        }

        // If not found locally, attempt HTTP(S) fetch (for remote URLs)
        if (!imageBuffer) {
          const https = require("https")
          const http = require("http")

          imageBuffer = await new Promise((imageResolve, imageReject) => {
            const client = templateUrl && templateUrl.startsWith("https") ? https : http
            client.get(templateUrl, (response) => {
              const chunks = []
              response.on("data", (chunk) => chunks.push(chunk))
              response.on("end", () => imageResolve(Buffer.concat(chunks)))
              response.on("error", imageReject)
            }).on("error", imageReject)
          })
        }

        // Add background image (full size) if we have it
        if (imageBuffer) {
          doc.image(imageBuffer, 0, 0, { width: 1280, height: 400 })
        }

        // Helper to place the QR image so it never overflows the page bounds
        const placeImageSafely = (doc, imageFile, desiredX, desiredY, desiredWidth) => {
          if (!fs.existsSync(imageFile)) return false

          const pageW = doc.page.width
          const pageH = doc.page.height
          const padding = 8

          // Start with desired width, ensure it does not exceed page width available
          let w = Math.min(desiredWidth, pageW - desiredX - padding)
          if (w <= 0) {
            // If desiredX is too far right, move left so at least some width fits
            w = Math.min(desiredWidth, pageW - padding * 2)
            desiredX = Math.max(padding, pageW - w - padding)
          }

          // For simplicity assume square QR (height ~= width)
          let h = w

          // If vertical overflow, try to move up; otherwise reduce size
          if (desiredY + h > pageH - padding) {
            const availableH = pageH - padding - desiredY
            if (availableH > padding * 2) {
              // shrink to fit vertically
              h = Math.min(h, availableH)
              w = h
            } else {
              // move up so it fits
              desiredY = Math.max(padding, pageH - h - padding)
            }
          }

          try {
            doc.image(imageFile, desiredX, desiredY, { width: w })
            return true
          } catch (e) {
            logger.warn(`Failed to place image safely: ${e.message}`)
            return false
          }
        }

        // Add QR code on top of the template at specified position (safely)
        const qrPath = path.join(UPLOADS_DIR, qrImageUrl.replace("/uploads/", ""))
        if (fs.existsSync(qrPath)) {
          placeImageSafely(doc, qrPath, qrPosition.x, qrPosition.y, qrPosition.width)
        }
      } catch (imgErr) {
        logger.warn("Failed to load template image, using fallback:", imgErr)
        // Fallback: just add QR code if image fails (place safely)
        const qrPath = path.join(UPLOADS_DIR, qrImageUrl.replace("/uploads/", ""))
        if (fs.existsSync(qrPath)) {
          // Use the pack's qrPosition if available, otherwise default to top-left
          const fallbackX = qrPosition && qrPosition.x ? qrPosition.x : 50
          const fallbackY = qrPosition && qrPosition.y ? qrPosition.y : 50
          const fallbackW = qrPosition && qrPosition.width ? Math.min(qrPosition.width, 200) : 200
          placeImageSafely(doc, qrPath, fallbackX, fallbackY, fallbackW)
        }
      }

      doc.end()

      stream.on("finish", () => {
        resolve(`/uploads/tickets/${ticketNumber}.pdf`)
      })

      stream.on("error", (err) => {
        reject(err)
      })
    } catch (err) {
      logger.error("PDF generation error:", err)
      reject({ status: 500, message: "Failed to generate ticket PDF" })
    }
  })
}

const createTicket = async (reservationId, userId) => {
  const transaction = await sequelize.transaction()

  try {
    if (!process.env.QR_SECRET) {
      const err = new Error("QR_SECRET environment variable is not configured")
      err.status = 500
      throw err
    }

    const reservation = await Reservation.findByPk(reservationId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
      rejectOnEmpty: true,
    })

    await reservation.reload({
      include: [
        { association: "participants", attributes: ["id", "name", "email"] },
        { association: "pack", attributes: ["id", "name"] },
      ],
      transaction,
    })

    // Step 2: Validate reservation state
    if (reservation.total_paid < reservation.total_price) {
      throw { status: 409, message: "Reservation not fully paid" }
    }

    if (reservation.status === "ticket_generated") {
      throw { status: 409, message: "Ticket already generated for this reservation" }
    }

    // Step 3: Generate ticket data
    const ticketNumber = generateTicketNumber()
    const qrPayload = generateQRPayload(ticketNumber, reservationId, process.env.QR_SECRET)

    // Generate QR as base64 data URL
    const qrDataUrl = await generateQRDataUrl(qrPayload)

    // Also generate file-based QR for PDF and backup
    const qrImageUrl = await generateQRImage(qrPayload)

    const packName = reservation.pack_name_snapshot || reservation.pack?.name || "Simple Soolouf"
    const pdfUrl = await generateTicketPDFWithImage(reservation, ticketNumber, qrImageUrl, packName)

    // Step 5: Create ticket record
    const ticket = await Ticket.create(
      {
        reservation_id: reservationId,
        ticket_number: ticketNumber,
        qr_payload: JSON.stringify(qrPayload),
        qr_image_url: qrImageUrl,
        pdf_url: pdfUrl,
        generated_by: userId,
      },
      { transaction },
    )

    // Step 6: Update reservation status
    await reservation.update({ status: "ticket_generated" }, { transaction })

    // Step 7: Log action with descriptive message
    await ActionLog.create(
      {
        user_id: userId,
        reservation_id: reservationId,
        action_type: "ticket.generate",
        meta: {
          ticket_id: ticket.id,
          ticket_number: ticketNumber,
          pack_name: packName,
          description: `Ticket généré avec succès (${ticketNumber})`,
        },
      },
      { transaction },
    )

    // Step 8: Commit transaction
    await transaction.commit()

    logger.info(`Ticket generated successfully: ${ticket.id} for reservation ${reservationId}`)

    return {
      ticket: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        qr_data_url: qrDataUrl,
        qr_image_url: ticket.qr_image_url,
        pdf_url: ticket.pdf_url,
        status: "valid",
        generated_at: ticket.generated_at,
        created_at: ticket.createdAt,
      },
      reservation: {
        id: reservation.id,
        status: "ticket_generated",
        pack_name: packName,
      },
    }
  } catch (err) {
    await transaction.rollback()
    logger.error(`Ticket generation failed for reservation ${reservationId}:`, err)
    throw err
  }
}

module.exports = { createTicket, generateQRImage, generateQRDataUrl, generateTicketPDFWithImage }