const PDFDocument = require("pdfkit")
const fs = require("fs")
const path = require("path")
const logger = require("../logger") // Assuming logger is required for error handling

const UPLOADS_DIR = path.join(process.cwd(), "uploads")
const TICKET_TEMPLATES = {
  Simple: "/templates/simple_ticket.png",
  "Simple Soolouf": "/templates/simple_soolouf_ticket.png",
  // Add more templates as needed
}
const QR_POSITIONS = {
  Simple: { x: 100, y: 100, width: 100 },
  "Simple Soolouf": { x: 200, y: 200, width: 150 },
  // Add more positions as needed
}

const ensureUploadsDir = () => {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }
  const ticketsDir = path.join(UPLOADS_DIR, "tickets")
  if (!fs.existsSync(ticketsDir)) {
    fs.mkdirSync(ticketsDir, { recursive: true })
  }
}

const resolveTemplateKey = (packName) => {
  // Implement logic to resolve template key based on packName
  // For simplicity, returning "Simple" for now
  return "Simple"
}

const generateQRDataUrl = (data) => {
  // Implement logic to generate QR data URL
  // Placeholder function
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA..."
}

const generateQRImage = async (dataUrl, outputPath) => {
  // Implement logic to generate QR image from data URL
  // Placeholder function
  return new Promise((resolve, reject) => {
    // Simulate QR image generation
    resolve(outputPath)
  })
}

const generateTicketPDF = async (reservation, ticketData, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 })
      const stream = fs.createWriteStream(outputPath)

      doc.pipe(stream)

      // Header
      doc.fontSize(20).font("Helvetica-Bold").text("MOVIE IN THE PARK", { align: "center" })
      doc.fontSize(12).font("Helvetica").text("Ticket d'accès", { align: "center" })
      doc.moveDown()

      // Ticket info
      doc.fontSize(11).font("Helvetica-Bold").text("Numéro du ticket")
      doc.fontSize(10).font("Helvetica").text(ticketData.ticket_number)
      doc.moveDown()

      // Payer info
      doc.fontSize(11).font("Helvetica-Bold").text("Informations du payeur")
      doc.fontSize(10).font("Helvetica")
      doc.text(`Nom: ${reservation.payeur_name}`)
      doc.text(`Téléphone: ${reservation.payeur_phone}`)
      if (reservation.payeur_email) doc.text(`Email: ${reservation.payeur_email}`)
      doc.moveDown()

      // Event details
      doc.fontSize(11).font("Helvetica-Bold").text("Détails de l'événement")
      doc.fontSize(10).font("Helvetica")
      doc.text(`Pack: ${reservation.pack_name_snapshot}`)
      doc.text(`Prix: ${(reservation.total_price / 100).toFixed(2)} XAF`)
      doc.moveDown()

      // Footer
      doc.fontSize(9).font("Helvetica").text(`Généré le ${new Date().toLocaleString()}`, { align: "center" })

      doc.end()

      stream.on("finish", () => resolve(outputPath))
      stream.on("error", (err) => reject(err))
    } catch (err) {
      reject(err)
    }
  })
}

const generateTicketPDFWithImage = async (reservation, ticketNumber, qrImageUrl, packName) => {
  ensureUploadsDir()
  const pdfPath = path.join(UPLOADS_DIR, "tickets", `${ticketNumber}.pdf`)

  const placeImageSafely = (doc, imageFile, desiredX, desiredY, desiredWidth) => {
    if (!fs.existsSync(imageFile)) return false

    const pageW = doc.page.width
    const pageH = doc.page.height
    const padding = 8

    let w = Math.min(desiredWidth, pageW - desiredX - padding)
    if (w <= 0) {
      w = Math.min(desiredWidth, pageW - padding * 2)
      desiredX = Math.max(padding, pageW - w - padding)
    }

    let h = w

    if (desiredY + h > pageH - padding) {
      const availableH = pageH - padding - desiredY
      if (availableH > padding * 2) {
        h = Math.min(h, availableH)
        w = h
      } else {
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

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [1280, 400], margin: 0 })
      const stream = fs.createWriteStream(pdfPath)

      doc.pipe(stream)

      const templateKey = resolveTemplateKey(packName)
      const templateUrl = TICKET_TEMPLATES[templateKey] || TICKET_TEMPLATES["Simple Soolouf"]
      const qrPosition = QR_POSITIONS[templateKey] || QR_POSITIONS["Simple Soolouf"]

      try {
        let imageBuffer = null

        if (templateUrl && templateUrl.startsWith("/")) {
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

        if (!imageBuffer) {
          const https = require("https")
          const http = require("http")

          imageBuffer = await new Promise((imageResolve, imageReject) => {
            const client = templateUrl && templateUrl.startsWith("https") ? https : http
            client
              .get(templateUrl, (response) => {
                const chunks = []
                response.on("data", (chunk) => chunks.push(chunk))
                response.on("end", () => imageResolve(Buffer.concat(chunks)))
                response.on("error", imageReject)
              })
              .on("error", imageReject)
          })
        }

        if (imageBuffer) {
          doc.image(imageBuffer, 0, 0, { width: 1280, height: 400 })
        }

        const qrPath = path.join(UPLOADS_DIR, qrImageUrl.replace("/uploads/", ""))
        if (fs.existsSync(qrPath)) {
          placeImageSafely(doc, qrPath, qrPosition.x, qrPosition.y, qrPosition.width)
        }
      } catch (imgErr) {
        logger.warn("Failed to load template image, using fallback:", imgErr)
        const qrPath = path.join(UPLOADS_DIR, qrImageUrl.replace("/uploads/", ""))
        if (fs.existsSync(qrPath)) {
          const fallbackX = qrPosition && qrPosition.x ? qrPosition.x : 50
          const fallbackY = qrPosition && qrPosition.y ? qrPosition.y : 50
          const fallbackW = qrPosition && qrPosition.width ? Math.min(qrPosition.width, 200) : 200
          placeImageSafely(doc, qrPath, fallbackX, fallbackY, fallbackW)
        }

        doc.fontSize(16).font("Helvetica-Bold").fillColor("#000000")
        doc.text(`Ticket: ${ticketNumber}`, 20, 20, {
          width: 200,
          align: "left",
        })
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

const createTicket = async (reservation, ticketNumber, qrImageUrl, packName) => {
  const qrDataUrl = generateQRDataUrl(ticketNumber)
  const qrPath = path.join(UPLOADS_DIR, "qr", `${ticketNumber}.png`)
  await generateQRImage(qrDataUrl, qrPath)
  return generateTicketPDFWithImage(reservation, ticketNumber, qrImageUrl, packName)
}

module.exports = { createTicket, generateQRImage, generateQRDataUrl, generateTicketPDFWithImage }
