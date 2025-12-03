const fs = require("fs")
const path = require("path")
const QRCode = require("qrcode")
const PDFDocument = require("pdfkit")
const { sequelize } = require("../models")
const { Ticket, Reservation, ActionLog } = require("../models")
const { generateQRPayload } = require("../utils/hmac")
const logger = require("../config/logger")

const UPLOADS_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads")

// Templates
const TICKET_TEMPLATES = {
  "VIP Soolouf": "/images/vip.jpg",
  "Simple Soolouf": "/images/simple.jpg",
  "Famille Soolouf": "/images/famille.jpg",
  "Couple Soolouf": "/images/couple.jpg",
}

// QR positions (identiques pour tous les modèles)
const QR_POSITIONS = {
  "Famille Soolouf": { x: 902, y: 113, width: 186 },
  "VIP Soolouf": { x: 902, y: 113, width: 186 },
  "Simple Soolouf": { x: 902, y: 113, width: 186 },
  "Couple Soolouf": { x: 902, y: 113, width: 186 },
}

const TEMPLATE_ALIASES = [
  { key: "VIP Soolouf", aliases: ["vip"] },
  { key: "Simple Soolouf", aliases: ["simple"] },
  { key: "Famille Soolouf", aliases: ["famille", "family"] },
  { key: "Couple Soolouf", aliases: ["couple"] },
]

const resolveTemplateKey = (packName) => {
  if (!packName || typeof packName !== "string") return "Simple Soolouf"
  const normalized = packName.trim().toLowerCase()

  for (const k of Object.keys(TICKET_TEMPLATES)) {
    if (k.toLowerCase() === normalized) return k
  }

  for (const entry of TEMPLATE_ALIASES) {
    if (entry.key.toLowerCase() === normalized) return entry.key
    for (const alias of entry.aliases) {
      if (normalized.includes(alias)) return entry.key
    }
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

// Ticket number
const generateTicketNumber = () => {
  const t = Date.now().toString(36).toUpperCase()
  const r = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `MIP-${t}-${r}`
}

// Generate QR base64 for API
const generateQRDataUrl = async (payload) => {
  return QRCode.toDataURL(JSON.stringify(payload), {
    width: 300,
    margin: 2,
    color: { dark: "#000", light: "#fff" },
  })
}

// Generate QR as file for PDF
const generateQRImage = async (payload) => {
  ensureUploadsDir()
  const qrPath = path.join(UPLOADS_DIR, "qr", `${payload.ticket_number}.png`)

  await QRCode.toFile(qrPath, JSON.stringify(payload), {
    width: 300,
    margin: 2,
    color: { dark: "#000", light: "#fff" },
  })

  return `/uploads/qr/${payload.ticket_number}.png`
}

const generateTicketPDFWithImage = async (reservation, ticketNumber, qrImageUrl, packName) => {
  ensureUploadsDir();

  const pdfPath = path.join(UPLOADS_DIR, "tickets", `${ticketNumber}.pdf`);

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [1280, 400], margin: 0 });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        const buffer = Buffer.concat(chunks);

        // On écrit le fichier sur disque (optionnel)
        fs.writeFileSync(pdfPath, buffer);

        resolve({
          buffer, // <== SUPER IMPORTANT
          pdfUrl: `/uploads/tickets/${ticketNumber}.pdf`,
        });
      });

      doc.on("error", reject);

      const templateKey = resolveTemplateKey(packName);
      const templateUrl = TICKET_TEMPLATES[templateKey];
      const qrPos = QR_POSITIONS[templateKey];

      const templatePath = path.join(process.cwd(), templateUrl);
      const imageBuffer = fs.readFileSync(templatePath);

      doc.image(imageBuffer, 0, 0, { width: 1280, height: 400 });

      const qrPath = path.join(UPLOADS_DIR, qrImageUrl.replace("/uploads/", ""));
      doc.image(qrPath, qrPos.x, qrPos.y, { width: qrPos.width });

      doc.rect(880, 330, 380, 40).fillOpacity(0.65).fill("#FFFFFF").fillOpacity(1);
      doc.fontSize(18).fillColor("#000").text(`Ticket : ${ticketNumber}`, 900, 340);

      doc.end();
    } catch (err) {
      logger.error("PDF generation failed:", err);
      reject({ status: 500, message: "Failed to generate ticket PDF" });
    }
  });
};


const createTicket = async (reservationId, userId) => {
  const transaction = await sequelize.transaction()

  try {
    const reservation = await Reservation.findByPk(reservationId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
      rejectOnEmpty: true,
    })

    await reservation.reload({
      include: [
        { association: "participants", attributes: ["id", "name", "email", "phone"] },
        { association: "pack", attributes: ["id", "name"] },
      ],
      transaction,
    })

    if (reservation.total_paid < reservation.total_price) throw { status: 409, message: "Reservation not fully paid" }

    if (reservation.status === "ticket_generated") throw { status: 409, message: "Ticket already generated" }

    const ticketNumber = generateTicketNumber()

    const participantsList = reservation.participants?.map((p) => ({
      name: p.name,
      email: p.email,
      phone: p.phone,
    }))

    const payer = {
      name: reservation.payeur_name,
      email: reservation.payeur_email,
      phone: reservation.payeur_phone,
    }

    const qrPayload = generateQRPayload(ticketNumber, reservationId, participantsList, payer, process.env.QR_SECRET)

    const qrDataUrl = await generateQRDataUrl(qrPayload)
    const qrImageUrl = await generateQRImage(qrPayload)

    const packName = reservation.pack_name_snapshot || reservation.pack?.name || "Simple Soolouf"
    const pdfResult = await generateTicketPDFWithImage(reservation, ticketNumber, qrImageUrl, packName);

    const pdfBuffer = pdfResult.buffer;
    const pdfUrl = pdfResult.pdfUrl;

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
          pack_name: packName,
          participants_count: participantsList.length,
        },
      },
      { transaction },
    )

    await transaction.commit()

    const { sendTicketWithPDFEmail } = require("./emailService")
    const ticketData = {
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      qr_data_url: qrDataUrl,
      qr_image_url: ticket.qr_image_url,
      pdf_url: ticket.pdf_url,
      pdf_buffer: pdfBuffer,

    }

    await new Promise((resolve) => setTimeout(resolve, 500))

    try {
      await sendTicketWithPDFEmail(reservation, ticketData, participantsList, pdfBuffer);

      logger.info(`Ticket emails sent successfully for reservation ${reservationId}`)
    } catch (err) {
      logger.error("Error in email sending:", err)
      // Don't throw - ticket is already generated, just log the error
    }

    return {
      ticket: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        qr_data_url: qrDataUrl,
        qr_image_url: ticket.qr_image_url,
        pdf_url: ticket.pdf_url,
      },
      reservation: {
        id: reservation.id,
        status: "ticket_generated",
        pack_name: packName,
      },
    }
  } catch (err) {
    await transaction.rollback()
    throw err
  }
}

module.exports = { createTicket, generateQRImage, generateQRDataUrl, generateTicketPDFWithImage }
