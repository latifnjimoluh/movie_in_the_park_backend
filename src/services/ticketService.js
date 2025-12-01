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

const generateTicketPDF = async (reservation, ticketNumber, participants, qrImageUrl) => {
  ensureUploadsDir()
  const pdfPath = path.join(UPLOADS_DIR, "tickets", `${ticketNumber}.pdf`)

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4" })
      const stream = fs.createWriteStream(pdfPath)

      doc.pipe(stream)

      doc.fontSize(20).font("Helvetica-Bold").text("MOVIE IN THE PARK", { align: "center" })
      doc
        .fontSize(12)
        .font("Helvetica")
        .text("Ticket Number: " + ticketNumber, { align: "center" })
      doc.moveDown()

      doc.fontSize(11).font("Helvetica-Bold").text("Payer Information")
      doc.fontSize(10).font("Helvetica")
      doc.text("Name: " + reservation.payeur_name)
      doc.text("Phone: " + reservation.payeur_phone)
      if (reservation.payeur_email) doc.text("Email: " + reservation.payeur_email)
      doc.moveDown()

      doc.fontSize(11).font("Helvetica-Bold").text("Event Details")
      doc.fontSize(10).font("Helvetica")
      doc.text("Pack: " + reservation.pack_name_snapshot)
      doc.text("Total Price: " + (reservation.total_price / 100).toFixed(2) + " XAF")
      doc.moveDown()

      doc.fontSize(11).font("Helvetica-Bold").text("Participants")
      doc.fontSize(10).font("Helvetica")
      participants.forEach((p) => {
        doc.text(`- ${p.name}`)
      })
      doc.moveDown()

      if (qrImageUrl) {
        const qrPath = path.join(UPLOADS_DIR, qrImageUrl.replace("/uploads/", ""))
        doc.fontSize(11).font("Helvetica-Bold").text("QR Code")
        doc.image(qrPath, { width: 150 })
      }

      doc
        .fontSize(9)
        .font("Helvetica")
        .text("Generated: " + new Date().toLocaleString(), {
          align: "center",
        })

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
    const reservation = await Reservation.findByPk(reservationId, {
      include: [{ association: "participants", attributes: ["id", "name", "email"] }, { association: "pack" }],
      lock: true,
      transaction,
    })

    if (!reservation) {
      throw { status: 404, message: "Reservation not found" }
    }

    if (reservation.total_paid < reservation.total_price) {
      throw { status: 409, message: "Reservation not fully paid" }
    }

    if (reservation.status === "ticket_generated") {
      throw { status: 409, message: "Ticket already generated for this reservation" }
    }

    const ticketNumber = generateTicketNumber()
    const qrPayload = generateQRPayload(ticketNumber, reservationId, process.env.QR_SECRET)
    const qrImageUrl = await generateQRImage(qrPayload)
    const pdfUrl = await generateTicketPDF(reservation, ticketNumber, reservation.participants, qrImageUrl)

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

    await reservation.update({ status: "ticket_generated" }, { transaction })

    await ActionLog.create(
      {
        user_id: userId,
        reservation_id: reservationId,
        action_type: "ticket.generate",
        meta: {
          ticket_id: ticket.id,
          ticket_number: ticketNumber,
        },
      },
      { transaction },
    )

    await transaction.commit()

    return {
      ticket: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        qr_image_url: ticket.qr_image_url,
        pdf_url: ticket.pdf_url,
      },
      reservation: {
        status: "ticket_generated",
      },
    }
  } catch (err) {
    await transaction.rollback()
    logger.error("Ticket creation error:", err)
    throw err
  }
}

module.exports = { createTicket, generateQRImage, generateTicketPDF }
