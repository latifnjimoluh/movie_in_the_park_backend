const nodemailer = require("nodemailer")
const sgMail = require("@sendgrid/mail")
const logger = require("../config/logger")
const path = require("path")
const PDFDocument = require("pdfkit")
const { Readable } = require("stream")
const fs = require("fs")

// Configuration du provider d'email
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "gmail" // 'gmail' ou 'sendgrid'

// Configuration de nodemailer pour Gmail
let transporter = null
if (EMAIL_PROVIDER === "gmail") {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
    pool: true, // ✅ Utiliser le pooling de connexions
    maxConnections: 5, // ✅ Max 5 connexions simultanées
    maxMessages: 100, // ✅ Max 100 messages par connexion
  })
  logger.info("Email provider: Gmail SMTP with connection pooling")
} else if (EMAIL_PROVIDER === "sendgrid") {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  logger.info("Email provider: SendGrid API")
} else {
  logger.error(`Unknown EMAIL_PROVIDER: ${EMAIL_PROVIDER}. Using Gmail as fallback.`)
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  })
}

/**
 * Fonction unifiée pour envoyer un email via Gmail ou SendGrid
 */
const sendEmail = async (mailOptions) => {
  try {
    if (EMAIL_PROVIDER === "sendgrid") {
      // Format SendGrid
      const sgMailOptions = {
        to: mailOptions.to,
        from: mailOptions.from || process.env.EMAIL_FROM,
        subject: mailOptions.subject,
        html: mailOptions.html,
      }

      // Gérer les pièces jointes
      if (mailOptions.attachments && mailOptions.attachments.length > 0) {
        sgMailOptions.attachments = mailOptions.attachments.map((att) => ({
          content: att.content.toString("base64"),
          filename: att.filename,
          type: att.contentType || "application/octet-stream",
          disposition: "attachment",
        }))
      }

      await sgMail.send(sgMailOptions)
      logger.info(`Email sent via SendGrid to ${mailOptions.to}`)
    } else {
      // Gmail SMTP
      await transporter.sendMail(mailOptions)
      logger.info(`Email sent via Gmail to ${mailOptions.to}`)
    }
  } catch (error) {
    logger.error(`Error sending email to ${mailOptions.to}: ${error.message}`)
    throw error
  }
}

// Format propre des montants en XAF
const formatXAF = (n) =>
  Number(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")

const generatePaymentReceiptPDF = async (reservation, payment, currentPayments) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 0 })
      const chunks = []

      doc.on("data", (chunk) => chunks.push(chunk))
      doc.on("end", () => resolve(Buffer.concat(chunks)))
      doc.on("error", reject)

      /* ---------------------------------------------
         🟣 HEADER NOIR + LOGO
      ----------------------------------------------*/
      doc.rect(0, 0, 595, 120).fill("#1a1a1a")

      try {
        const logoPath = path.join(__dirname, "..", "images", "logo.png")
        doc.image(logoPath, 25, 20, { width: 90 })
      } catch {}

      doc.fillColor("#fff").font("Helvetica-Bold").fontSize(24)
      doc.text("Movie in the Park", 130, 35)

      doc.font("Helvetica").fontSize(12)
      doc.text("Bon d'avancement", 130, 65)

      const now = new Date()
      const dateStr = now.toLocaleDateString("fr-FR")
      const timeStr = now.toLocaleTimeString("fr-FR")

      doc.fontSize(10).text("Date d'émission", 430, 35)
      doc.font("Helvetica-Bold").fontSize(14).text(`${dateStr} à ${timeStr}`, 430, 55)

      /* ---------------------------------------------
         👤 INFORMATIONS DU PAYEUR
      ----------------------------------------------*/
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(16)
      doc.text("INFORMATIONS DU PAYEUR", 30, 150)

      doc.font("Helvetica").fontSize(10).fillColor("#666")
      doc.text("Nom complet", 30, 190)
      doc.text("Téléphone", 300, 190)

      doc.fillColor("#000").font("Helvetica-Bold")
      doc.text(reservation.payeur_name || "—", 30, 205)
      doc.text(reservation.payeur_phone || "—", 300, 205)

      doc.font("Helvetica").fillColor("#666")
      doc.text("Email", 30, 240)
      doc.text("Pack", 300, 240)

      doc.fillColor("#000").font("Helvetica-Bold")
      doc.text(reservation.payeur_email || "—", 30, 255)
      doc.text(reservation.pack_name_snapshot || reservation.pack_name, 300, 255)

      /* ============================================================
         📦 CADRE - DÉTAILS DU PAIEMENT
      ============================================================ */

      const boxX = 25
      const boxY = 310
      const boxW = 545
      const boxH = 150

      doc.roundedRect(boxX, boxY, boxW, boxH, 6).stroke("#ccc")

      doc.font("Helvetica-Bold").fontSize(16).fillColor("#000")
      doc.text("Détails du paiement", boxX + 15, boxY + 15)

      const labelX = boxX + 15
      const valueAreaX = boxX + 300
      const valueAreaWidth = boxW - 320

      let lineY = boxY + 55

      // Prix total
      doc.font("Helvetica").fontSize(11).fillColor("#666")
      doc.text("Prix total", labelX, lineY)
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#000")
      doc.text(`${formatXAF(reservation.total_price)} XAF`, valueAreaX, lineY - 2, {
        width: valueAreaWidth,
        align: "right",
      })

      // Montant payé
      lineY += 32
      doc.font("Helvetica").fontSize(11).fillColor("#666")
      doc.text("Montant payé", labelX, lineY)
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#16a34a")
      doc.text(`${formatXAF(reservation.total_paid)} XAF`, valueAreaX, lineY - 2, {
        width: valueAreaWidth,
        align: "right",
      })

      // Montant restant
      lineY += 32
      const remaining = reservation.total_price - reservation.total_paid
      doc.font("Helvetica").fontSize(11).fillColor("#000")
      doc.text("Montant restant", labelX, lineY)
      doc.font("Helvetica-Bold").fontSize(18).fillColor("#ea580c")
      doc.text(`${formatXAF(remaining)} XAF`, valueAreaX, lineY - 4, { width: valueAreaWidth, align: "right" })

      /* ---------------------------------------------
         💵 DERNIERS PAIEMENTS
      ----------------------------------------------*/
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(16)
      doc.text("Derniers paiements", 30, 500)

      doc.font("Helvetica").fontSize(11).fillColor("#000")

      const startY = 530
      const valueAreaX2 = 350
      const valueAreaWidth2 = 200

      const lastPayments = currentPayments.slice(0, 3)

      if (lastPayments.length === 0) {
        doc.text("Aucun paiement enregistré", 30, startY)
      } else {
        lastPayments.forEach((p, i) => {
          const date = new Date(p.createdAt).toLocaleDateString("fr-FR")
          const method = p.method === "cash" ? "Espèces" : p.method === "momo" ? "Mobile Money" : p.method

          doc.font("Helvetica").text(`${date} — ${method}`, 30, startY + i * 28)
          doc.font("Helvetica-Bold")
          doc.text(`${formatXAF(p.amount)} XAF`, valueAreaX2, startY + i * 28, {
            width: valueAreaWidth2,
            align: "right",
          })
        })
      }

      /* ---------------------------------------------
         FOOTER
      ----------------------------------------------*/
      doc.fontSize(9).fillColor("#999")
      doc.text("Document généré automatiquement — Movie in the Park", 0, 780, {
        align: "center",
      })
      doc.text(`Réservation #${reservation.id.substring(0, 8)}`, 0, 795, {
        align: "center",
      })

      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}

/* ---------------------------------------------
   📩 EMAIL AU PAYEUR (1 seul email)
----------------------------------------------*/
const sendPayerEmail = async (reservation, participants, pack) => {
  if (!reservation.payeur_email) return

  const participantsList = participants.map((p) => `• ${p.name}${p.email ? ` (${p.email})` : ""}`).join("\n")

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px; border-radius: 8px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: white; padding: 20px; border-radius: 0 0 8px 8px; }
        .section { margin: 20px 0; border-bottom: 1px solid #eee; padding-bottom: 15px; }
        .section:last-child { border-bottom: none; }
        .label { font-weight: bold; color: #667eea; }
        .price-box { background: #f0f4ff; padding: 15px; border-left: 4px solid #667eea; margin: 15px 0; border-radius: 5px; }
        .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; }
        .contact-box { background: #fff6e5; padding: 15px; border-left: 4px solid #ff9800; margin: 20px 0; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Confirmation de Réservation</h1>
          <p>Movie In The Park</p>
        </div>

        <div class="content">
          <p>Bonjour <strong>${reservation.payeur_name}</strong>,</p>
          
          <p>Nous vous remercions pour votre réservation chez Movie In The Park. Votre demande est enregistrée et en attente de paiement.</p>

          <div class="section">
            <div class="label">📋 Récapitulatif de la Réservation</div>
            <p><strong>Pack choisi :</strong> ${pack.name}</p>
            <p><strong>Description :</strong> ${pack.description || "N/A"}</p>
            <p><strong>Nombre de participants :</strong> ${participants.length}</p>
          </div>

          <div class="section">
            <div class="label">👥 Liste des Participants</div>
            <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${participantsList}</pre>
          </div>

          <div class="price-box">
            <p><strong>Montant à payer :</strong></p>
            <p style="font-size: 24px; color: #667eea;"><strong>${reservation.total_price.toLocaleString()} XAF</strong></p>
          </div>

          <div class="contact-box">
            <p><strong>Pour finaliser la réservation :</strong></p>
            <p>📞 Contactez le : <strong>+237 6 97 30 44 50</strong></p>
            <p>💬 Un assistant WhatsApp vous aidera pour le paiement.</p>
            <p>📧 Ou envoyez un mail à : <strong>matangabrooklyn@gmail.com</strong></p>
          </div>

          <p>Votre réservation sera confirmée après validation du paiement.</p>

          <div class="footer">
            <p>Email automatique, ne pas répondre.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await sendEmail({
      from: process.env.SMTP_FROM || process.env.EMAIL_FROM,
      to: reservation.payeur_email,
      subject: `Confirmation de réservation - Movie In The Park`,
      html: htmlContent,
    })
    logger.info(`Payer email sent to ${reservation.payeur_email}`)
  } catch (error) {
    logger.error(`Error sending payer email: ${error.message}`)
  }
}

/* ---------------------------------------------
   📩 EMAIL AUX PARTICIPANTS (sauf le payeur)
----------------------------------------------*/
const sendParticipantEmail = async (participant, reservation, pack) => {
  if (!participant.email) return
  if (participant.email === reservation.payeur_email) return

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px; border-radius: 8px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: white; padding: 20px; border-radius: 0 0 8px 8px; }
        .section { margin: 20px 0; border-bottom: 1px solid #eee; padding-bottom: 15px; }
        .section:last-child { border-bottom: none; }
        .label { font-weight: bold; color: #667eea; }
        .info-box { background: #f0f4ff; padding: 15px; border-left: 4px solid #667eea; margin: 15px 0; border-radius: 5px; }
        .contact-box { background: #fff6e5; padding: 15px; border-left: 4px solid #ff9800; margin: 20px 0; border-radius: 5px; }
        .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Participation Confirmée</h1>
          <p>Movie In The Park</p>
        </div>

        <div class="content">
          <p>Bonjour <strong>${participant.name}</strong>,</p>
          
          <p>Vous avez été ajouté comme participant à une réservation Movie In The Park.</p>
          
          <div class="section">
            <div class="label">📋 Détails de votre participation</div>
            <p><strong>Nom :</strong> ${participant.name}</p>
            <p><strong>Email :</strong> ${participant.email}</p>
            <p><strong>Téléphone :</strong> ${participant.phone || "N/A"}</p>
          </div>

          <div class="section">
            <div class="label">🎬 Informations de l'événement</div>
            <p><strong>Pack :</strong> ${pack.name}</p>
            <p><strong>Description :</strong> ${pack.description || "N/A"}</p>
          </div>

          <div class="info-box">
            <p><strong>Réservé par :</strong></p>
            <p><strong>${reservation.payeur_name}</strong></p>
            <p>Téléphone : ${reservation.payeur_phone}</p>
            ${reservation.payeur_email ? `<p>Email : ${reservation.payeur_email}</p>` : ""}
          </div>

          <div class="contact-box">
            <p><strong>Pour finaliser la réservation :</strong></p>
            <p>📞 Contactez le : <strong>+237 6 97 30 44 50</strong></p>
            <p>💬 Un assistant WhatsApp vous aidera pour le paiement.</p>
            <p>📧 Ou envoyez un mail à : <strong>matangabrooklyn@gmail.com</strong></p>
          </div>

          <p>Votre place sera confirmée lorsque le paiement du réservant aura été validé.</p>

          <div class="footer">
            <p>Email automatique, ne pas répondre.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await sendEmail({
      from: process.env.SMTP_FROM || process.env.EMAIL_FROM,
      to: participant.email,
      subject: `Participation confirmée - Movie In The Park`,
      html: htmlContent,
    })
    logger.info(`Participant email sent to ${participant.email}`)
  } catch (error) {
    logger.error(`Error sending participant email: ${error.message}`)
  }
}

/* ===== PAYMENT EMAILS ===== */
const sendPaymentConfirmationEmail = async (reservation, payment, allPayments) => {
  if (!reservation.payeur_email) return

  const remainingAmount = reservation.total_price - reservation.total_paid
  const isFullyPaid = remainingAmount === 0

  const methodLabels = {
    cash: "Espèces",
    momo: "Mobile Money",
    orange: "Orange Money",
    card: "Carte bancaire",
  }

  const paymentMethod = methodLabels[payment.method] || payment.method
  const statusMessage = isFullyPaid
    ? "✅ Vous avez payé la totalité de la réservation. Votre ticket est en cours de génération."
    : `💳 Paiement partiellement reçu. Il reste <strong>${remainingAmount.toLocaleString()} XAF</strong> à payer.`

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px; border-radius: 8px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: white; padding: 20px; border-radius: 0 0 8px 8px; }
        .section { margin: 20px 0; border-bottom: 1px solid #eee; padding-bottom: 15px; }
        .section:last-child { border-bottom: none; }
        .label { font-weight: bold; color: #667eea; }
        .status-box { background: ${isFullyPaid ? "#e8f5e9" : "#fff3e0"}; border-left: 4px solid ${isFullyPaid ? "#16a34a" : "#ff9800"}; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .price-box { background: #f0f4ff; padding: 15px; border-left: 4px solid #667eea; margin: 15px 0; border-radius: 5px; }
        .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Confirmation de Paiement</h1>
          <p>Movie In The Park</p>
        </div>

        <div class="content">
          <p>Bonjour <strong>${reservation.payeur_name}</strong>,</p>
          
          <p>Nous avons bien reçu votre paiement. Voici le détail de votre transaction.</p>

          <div class="status-box">
            <p>${statusMessage}</p>
          </div>

          <div class="section">
            <div class="label">💰 Détails du paiement</div>
            <p><strong>Montant reçu :</strong> <span style="color: #16a34a; font-size: 18px; font-weight: bold;">${payment.amount.toLocaleString()} XAF</span></p>
            <p><strong>Méthode :</strong> ${paymentMethod}</p>
            <p><strong>Date :</strong> ${new Date(payment.createdAt).toLocaleDateString("fr-FR")} à ${new Date(payment.createdAt).toLocaleTimeString("fr-FR")}</p>
          </div>

          <div class="section">
            <div class="label">📊 Récapitulatif de votre réservation</div>
            <p><strong>Montant total :</strong> ${reservation.total_price.toLocaleString()} XAF</p>
            <p><strong>Total payé :</strong> <span style="color: #16a34a;">${reservation.total_paid.toLocaleString()} XAF</span></p>
            <p><strong>Montant restant :</strong> <span style="color: #ea580c;">${remainingAmount.toLocaleString()} XAF</span></p>
          </div>

          <div class="price-box">
            <p><strong>📌 Statut :</strong> ${isFullyPaid ? "✅ COMPLÈTEMENT PAYÉ" : "⏳ EN ATTENTE DE COMPLÉMENT"}</p>
          </div>

          <p>${
            isFullyPaid
              ? "Votre ticket a été généré automatiquement. Vous le recevrez très bientôt par email."
              : "Pour finaliser votre réservation, veuillez nous envoyer le montant restant."
          }</p>

          <div class="footer">
            <p>Email automatique, ne pas répondre.</p>
            <p>📞 Pour toute question : +237 6 97 30 44 50 | 📧 matangabrooklyn@gmail.com</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    const pdfBuffer = await generatePaymentReceiptPDF(reservation, payment, allPayments)

    await sendEmail({
      from: process.env.SMTP_FROM || process.env.EMAIL_FROM,
      to: reservation.payeur_email,
      subject: `Confirmation de paiement - Movie In The Park (${payment.amount.toLocaleString()} XAF)`,
      html: htmlContent,
      attachments: [
        {
          filename: `bon-avancement-${reservation.id.substring(0, 8)}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    })
    logger.info(`Payment confirmation email sent to ${reservation.payeur_email}`)
  } catch (error) {
    logger.error(`Error sending payment confirmation email: ${error.message}`)
  }
}

/* ===== TICKET READY EMAIL ===== */
const sendTicketReadyEmail = async (reservation, ticketData) => {
  if (!reservation.payeur_email) return

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px; border-radius: 8px; }
        .header { background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: white; padding: 20px; border-radius: 0 0 8px 8px; }
        .section { margin: 20px 0; border-bottom: 1px solid #eee; padding-bottom: 15px; }
        .section:last-child { border-bottom: none; }
        .label { font-weight: bold; color: #16a34a; }
        .ticket-box { background: #e8f5e9; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; border-radius: 5px; text-align: center; }
        .ticket-number { font-family: monospace; font-size: 18px; font-weight: bold; color: #16a34a; }
        .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Ticket Généré!</h1>
          <p>Movie In The Park</p>
        </div>

        <div class="content">
          <p>Bonjour <strong>${reservation.payeur_name}</strong>,</p>
          
          <p>Félicitations! Votre paiement a été reçu en totalité et votre ticket a été généré avec succès.</p>

          <div class="ticket-box">
            <p><strong>Numéro de ticket</strong></p>
            <div class="ticket-number">${ticketData.ticket_number}</div>
          </div>

          <div class="section">
            <div class="label">📋 Informations de votre réservation</div>
            <p><strong>Pack :</strong> ${reservation.pack_name_snapshot || "N/A"}</p>
            <p><strong>Quantité :</strong> ${reservation.quantity} participants</p>
            <p><strong>Montant total payé :</strong> <span style="color: #16a34a; font-weight: bold;">${reservation.total_paid.toLocaleString()} XAF</span></p>
          </div>

          <p><strong>📌 Prochaines étapes :</strong></p>
          <ul>
            <li>Téléchargez votre ticket en pièce jointe</li>
            <li>Présentez le code QR à l'entrée</li>
            <li>Amusez-vous bien! 🎬</li>
          </ul>

          <div class="footer">
            <p>Email automatique, ne pas répondre.</p>
            <p>📞 Pour toute question : +237 6 97 30 44 50 | 📧 matangabrooklyn@gmail.com</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await sendEmail({
      from: process.env.SMTP_FROM || process.env.EMAIL_FROM,
      to: reservation.payeur_email,
      subject: `Votre ticket est prêt! - Movie In The Park (${ticketData.ticket_number})`,
      html: htmlContent,
    })
    logger.info(`Ticket ready email sent to ${reservation.payeur_email}`)
  } catch (error) {
    logger.error(`Error sending ticket ready email: ${error.message}`)
  }
}

/* ===== TICKET WITH PDF EMAIL ===== */
const sendTicketWithPDFEmail = async (reservation, ticketData, participants, pdfBuffer) => {
  logger.info(`[sendTicketWithPDFEmail] Starting email send for reservation ${reservation.id}`)

  const emailsToSend = []

  // 1. Ajouter le payeur
  if (reservation.payeur_email) {
    emailsToSend.push({
      email: reservation.payeur_email,
      name: reservation.payeur_name,
      role: "payer",
    })
  }

  // 2. Ajouter les participants avec emails (sauf le payeur)
  if (participants && Array.isArray(participants)) {
    participants.forEach((p) => {
      if (p.email && p.email !== reservation.payeur_email) {
        emailsToSend.push({
          email: p.email,
          name: p.name,
          role: "participant",
        })
      }
    })
  }

  // Pas d'email à envoyer
  if (emailsToSend.length === 0) {
    logger.info("No valid emails to send ticket")
    return
  }

  logger.info(`[sendTicketWithPDFEmail] Found ${emailsToSend.length} recipients to send ticket to`)

  // Récupérer le PDF du ticket si pas fourni
  let ticketPdfPath = ticketData?.pdf_url || ticketData?.path || null
  if (ticketPdfPath && ticketPdfPath.startsWith("/")) {
    ticketPdfPath = path.join(process.cwd(), "backend", ticketPdfPath)
  }

  logger.info(`[sendTicketWithPDFEmail] Looking for PDF at: ${ticketPdfPath}`)

  try {
    let attempts = 0
    const maxAttempts = 5

    while (attempts < maxAttempts && !pdfBuffer) {
      if (ticketPdfPath && fs.existsSync(ticketPdfPath)) {
        try {
          pdfBuffer = fs.readFileSync(ticketPdfPath)
          logger.info(`[sendTicketWithPDFEmail] PDF file found and read successfully (attempt ${attempts + 1})`)
          break
        } catch (readErr) {
          logger.warn(`[sendTicketWithPDFEmail] Error reading PDF (attempt ${attempts + 1}): ${readErr.message}`)
          attempts++
          if (attempts < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 200))
        }
      } else {
        logger.warn(`[sendTicketWithPDFEmail] PDF file does not exist yet (attempt ${attempts + 1}): ${ticketPdfPath}`)
        attempts++
        if (attempts < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }

    if (!pdfBuffer) {
      logger.warn(`[sendTicketWithPDFEmail] Could not read ticket PDF after ${maxAttempts} attempts`)
    }
  } catch (err) {
    logger.warn(`[sendTicketWithPDFEmail] Error accessing PDF: ${err.message}`)
  }

  // Envoyer les emails à chaque destinataire
  for (const recipient of emailsToSend) {
    try {
      await sendTicketEmailToRecipient(recipient, reservation, ticketData, pdfBuffer)
    } catch (err) {
      logger.error(`[sendTicketWithPDFEmail] Failed sending to ${recipient.email}: ${err.message}`)
    }
  }

  logger.info(`[sendTicketWithPDFEmail] All ticket emails processed for reservation ${reservation.id}`)
}

/* ===== helper: envoi d'un email de ticket à un destinataire unique ===== */
const sendTicketEmailToRecipient = async (recipient, reservation, ticketData, pdfBuffer) => {
  const isPayer = recipient.role === "payer"

  const headerText = isPayer ? "Votre Ticket est Prêt! 🎬" : "Félicitations pour votre participation! 🎬"

  const greeting = `Bonjour <strong>${recipient.name || "Participant"}</strong>,`

  const mainMessage = isPayer
    ? `Félicitations! Votre paiement a été reçu en totalité et votre ticket a été généré avec succès. Vous pouvez maintenant profiter de l'événement Movie In The Park.`
    : `Nous sommes heureux de vous confirmer votre participation à l'événement Movie In The Park! Votre réservation est finalisée et votre ticket est prêt.`

  const reservedBySection = isPayer
    ? ""
    : `
      <div class="section">
        <div class="label">👤 Réservé par</div>
        <p><strong>${reservation.payeur_name}</strong></p>
        <p>Téléphone : ${reservation.payeur_phone}</p>
        ${reservation.payeur_email ? `<p>Email : ${reservation.payeur_email}</p>` : ""}
      </div>
    `

  const packSection = isPayer
    ? `
      <div class="section">
        <div class="label">📦 Pack choisi</div>
        <p><strong>${reservation.pack_name_snapshot || reservation.pack_name || "N/A"}</strong></p>
        <p><strong>Nombre de participants :</strong> ${reservation.quantity || 1}</p>
        <p><strong>Montant total payé :</strong> <span style="color: #16a34a; font-weight: bold;">${(reservation.total_paid || 0).toLocaleString()} XAF</span></p>
      </div>
    `
    : `
      <div class="section">
        <div class="label">📦 Pack choisi</div>
        <p><strong>${reservation.pack_name_snapshot || reservation.pack_name || "N/A"}</strong></p>
        <p><strong>Nombre de participants :</strong> ${reservation.quantity || 1}</p>
      </div>
    `

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px; border-radius: 8px; }
        .header { background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; }
        .section { margin: 25px 0; padding-bottom: 20px; border-bottom: 1px solid #eee; }
        .label { font-weight: bold; color: #16a34a; font-size: 16px; margin-bottom: 10px; }
        .ticket-box { background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); border-left: 4px solid #16a34a; padding: 20px; margin: 20px 0; border-radius: 5px; text-align: center; }
        .ticket-number { font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; color: #16a34a; letter-spacing: 2px; margin: 10px 0; }
        .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${headerText}</h1>
          <p>Movie In The Park</p>
        </div>

        <div class="content">
          <p>${greeting}</p>
          <p>${mainMessage}</p>

          <div class="ticket-box">
            <p style="margin: 0 0 10px; font-size: 14px; color: #333;">Numéro de Ticket</p>
            <div class="ticket-number">${ticketData.ticket_number}</div>
            <p style="margin: 10px 0 0; font-size: 12px; color: #666;">Conservez ce numéro, vous en aurez besoin à l'entrée</p>
          </div>

          ${packSection}
          ${reservedBySection}

          <div class="section" style="padding-bottom: 0; border-bottom: none;">
            <p style="font-size: 12px; color: #666; margin: 0;">
              <strong>📎 Pièce jointe :</strong> Votre ticket au format PDF est inclus dans cet email. Vous pouvez le télécharger et l'imprimer ou le présenter directement depuis votre téléphone.
            </p>
          </div>

          <div class="footer">
            <p>Merci d'avoir choisi Movie In The Park!</p>
            <p>📞 Pour toute question : +237 6 97 30 44 50 | 📧 matangabrooklyn@gmail.com</p>
            <p style="margin-top: 10px; font-size: 11px; color: #ccc;">Email automatique, ne pas répondre.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: recipient.email,
      subject: `Votre ticket Movie In The Park est prêt! (${ticketData.ticket_number})`,
      html: htmlContent,
    }

    if (pdfBuffer) {
      mailOptions.attachments = [
        {
          filename: `ticket-${ticketData.ticket_number}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ]
    }

    await sendEmail(mailOptions)
    logger.info(`Ticket email sent to ${recipient.email} (role: ${recipient.role})`)
  } catch (error) {
    logger.error(`Error sending ticket email to ${recipient.email}: ${error.message}`)
  }
}

/* ===== ADMIN NOTIFICATION EMAIL ===== */
const sendAdminNotificationEmail = async (reservation, participants, pack, adminEmails) => {
  const emailsArray = Array.isArray(adminEmails) ? adminEmails : adminEmails ? [adminEmails] : []
  const validEmails = emailsArray.filter((email) => email && typeof email === "string" && email.trim() !== "")

  if (validEmails.length === 0) {
    logger.warn("No admin emails configured for notifications")
    return
  }

  const participantsList = participants
    .map((p) => `• ${p.name}${p.phone ? ` (Tél: ${p.phone})` : ""}${p.email ? ` (${p.email})` : ""}`)
    .join("\n")

  // ✅ Nettoyer le numéro de téléphone (enlever les espaces, +, etc.)
  const cleanPhone = reservation.payeur_phone.replace(/[^0-9]/g, "")
  
  // ✅ Créer le message WhatsApp personnalisé
  const whatsappMessage = `Bonjour ${reservation.payeur_name}, Je suis de l'équipe Movie In The Park. Je vous écris concernant votre réservation pour ${pack.name} : ${reservation.total_price.toLocaleString()} XAF

La suite est simple :
Vous devez faire votre dépôt au numéro suivant : 697304450 ou 670782799 (le nom c'est : FRANCES BROOKLYN MATANGA ENDALE)

Par la suite m'envoyer une capture d'écran lisible.

Après ça votre ticket vous sera envoyé par E-mail ou ici comme vous le désireriez.

Passez une bonne journée 🙂`
  
  // ✅ Le href va automatiquement encoder le message UNE SEULE FOIS
  const whatsappLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 700px; margin: 0 auto; background: #f0f0f0; padding: 20px; border-radius: 8px; }
        .header { background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: white; padding: 20px; border-radius: 0 0 8px 8px; }
        .section { margin: 20px 0; border-bottom: 1px solid #eee; padding-bottom: 15px; }
        .section:last-child { border-bottom: none; }
        .label { font-weight: bold; color: #e74c3c; font-size: 14px; }
        .highlight { background: #fff3cd; padding: 15px; border-left: 4px solid #e74c3c; margin: 15px 0; border-radius: 5px; }
        .price-box { background: #ffe5e5; padding: 15px; border-left: 4px solid #e74c3c; margin: 15px 0; border-radius: 5px; font-size: 16px; }
        .contact-box { background: #e8f5e9; padding: 15px; border-left: 4px solid #27ae60; margin: 15px 0; border-radius: 5px; }
        .whatsapp-btn { display: inline-block; background: #25d366; color: white; padding: 10px 15px; border-radius: 5px; text-decoration: none; font-weight: bold; margin: 10px 0; }
        .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; }
        .info { font-size: 13px; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📢 Nouvelle Réservation</h2>
          <p style="margin: 0; font-size: 14px;">Movie In The Park - Notification Admin</p>
        </div>

        <div class="content">
          <p style="color: #e74c3c; font-weight: bold;">⚠️ Une nouvelle réservation est en attente de paiement</p>
          
          <div class="section">
            <div class="label">👤 INFORMATIONS DU PAYEUR</div>
            <div class="info">
              <p><strong>Nom :</strong> ${reservation.payeur_name}</p>
              <p><strong>Téléphone :</strong> ${reservation.payeur_phone}</p>
              <p><strong>Email :</strong> ${reservation.payeur_email || "N/A"}</p>
            </div>
          </div>

          <div class="section">
            <div class="label">🎬 DÉTAILS DE LA RÉSERVATION</div>
            <div class="info">
              <p><strong>Pack :</strong> ${pack.name}</p>
              <p><strong>Description :</strong> ${pack.description || "N/A"}</p>
              <p><strong>Nombre de participants :</strong> ${participants.length}</p>
              <p><strong>Quantité :</strong> ${reservation.quantity}</p>
            </div>
          </div>

          <div class="section">
            <div class="label">👥 LISTE DES PARTICIPANTS</div>
            <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; font-size: 12px; max-height: 200px; overflow-y: auto;">${participantsList}</pre>
          </div>

          <div class="price-box">
            <p style="margin: 0;"><strong>💰 Montant à percevoir :</strong></p>
            <p style="font-size: 24px; margin: 10px 0 0 0;"><strong>${reservation.total_price.toLocaleString()} XAF</strong></p>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #c0392b;">Statut : <strong>${reservation.status}</strong></p>
          </div>

          <div class="contact-box">
            <p style="margin-top: 0;"><strong>🔗 ACTIONS RAPIDES :</strong></p>
            <p>
              <a href="${whatsappLink}" class="whatsapp-btn">💬 Contacter via WhatsApp</a>
            </p>
            <p style="font-size: 12px; color: #666;">Ou appelez : <strong>${reservation.payeur_phone}</strong></p>
          </div>

          <div class="highlight">
            <p><strong>📊 Récapitulatif :</strong></p>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>Réservé depuis : ${new Date(reservation.createdAt).toLocaleString("fr-FR")}</li>
              <li>Montant restant : <strong>${(reservation.total_price - reservation.total_paid).toLocaleString()} XAF</strong></li>
              <li>Payeur Email : ${reservation.payeur_email || "Pas d'email fourni"}</li>
              <li>Nombre total participants : ${participants.length}</li>
            </ul>
          </div>

          <p style="text-align: center; margin: 20px 0;">
            <strong style="color: #e74c3c;">N'oubliez pas de relancer le client pour le paiement !</strong>
          </p>

          <div class="footer">
            <p>Email automatique - Notification système Movie In The Park</p>
            <p>Timestamp: ${new Date().toISOString()}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  // ✅ ENVOYER LES EMAILS UN PAR UN AVEC DÉLAI pour éviter "socket close"
  for (let i = 0; i < validEmails.length; i++) {
    const adminEmail = validEmails[i]
    try {
      await sendEmail({
        from: process.env.SMTP_FROM || process.env.EMAIL_FROM,
        to: adminEmail,
        subject: `[NOUVELLE RÉSERVATION] ${reservation.payeur_name} - ${pack.name} (${reservation.total_price.toLocaleString()} XAF)`,
        html: htmlContent,
      })
      logger.info(`Admin notification email sent to ${adminEmail}`)
      
      // ✅ ATTENDRE 2 SECONDES entre chaque email pour éviter les problèmes de socket
      if (i < validEmails.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    } catch (error) {
      logger.error(`Error sending admin notification email to ${adminEmail}: ${error.message}`)
    }
  }
}

module.exports = {
  sendPayerEmail,
  sendParticipantEmail,
  sendPaymentConfirmationEmail,
  sendTicketReadyEmail,
  sendTicketWithPDFEmail,
  sendTicketEmailToRecipient,
  sendAdminNotificationEmail,
  transporter,
}
