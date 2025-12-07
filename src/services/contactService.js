const nodemailer = require("nodemailer")
const sgMail = require("@sendgrid/mail")
const logger = require("../config/logger")

// Configuration du provider d'email (même que emailService)
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "gmail"
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
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  })
} else if (EMAIL_PROVIDER === "sendgrid") {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

/**
 * Envoyer un email de contact aux administrateurs
 */
const sendContactEmail = async (contactData) => {
  try {
    const { name, email, phone, subject, message } = contactData

    // Récupérer la liste des admins depuis .env
    const adminEmails = process.env.CONTACT_ADMINS
      ? process.env.CONTACT_ADMINS.split(",").map((e) => e.trim())
      : [process.env.EMAIL_FROM]

    // Validation basique
    if (!email || email.trim() === "") {
      throw new Error("Email is required")
    }
    if (!message || message.trim() === "") {
      throw new Error("Message is required")
    }

    // Échapper le contenu du message (éviter injection HTML)
    const escapedMessage = message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .split("\n")
      .join("<br />")

    const escapedName = (name || "Non spécifié").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const escapedPhone = (phone || "Non fourni").replace(/</g, "&lt;").replace(/>/g, "&gt;")

    // Construire le template HTML
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #8B0000; color: white; padding: 20px; text-align: center; border-radius: 8px; }
          .content { background-color: #f5f5f5; padding: 20px; margin-top: 20px; border-radius: 8px; }
          .field { margin-bottom: 15px; }
          .label { font-weight: bold; color: #8B0000; }
          .value { margin-top: 5px; padding: 10px; background-color: white; border-left: 3px solid #8B0000; }
          .footer { margin-top: 20px; font-size: 12px; color: #999; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Nouveau message de contact - Movie In The Park</h1>
          </div>
          
          <div class="content">
            <div class="field">
              <div class="label">Sujet:</div>
              <div class="value">${subject || "Sans objet"}</div>
            </div>
            
            <div class="field">
              <div class="label">De:</div>
              <div class="value">${escapedName}</div>
            </div>
            
            <div class="field">
              <div class="label">Email:</div>
              <div class="value"><a href="mailto:${email}">${email}</a></div>
            </div>
            
            <div class="field">
              <div class="label">Téléphone:</div>
              <div class="value">${escapedPhone}</div>
            </div>
            
            <div class="field">
              <div class="label">Message:</div>
              <div class="value">${escapedMessage}</div>
            </div>
          </div>
          
          <div class="footer">
            <p>Message reçu le: ${new Date().toLocaleString("fr-FR")}</p>
            <p>Adresse IP du client: ${contactData.clientIp || "Non disponible"}</p>
          </div>
        </div>
      </body>
      </html>
    `

    // Préparer les options d'email
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: adminEmails.join(", "),
      subject: `[CONTACT] ${subject || "Message de contact"}`,
      html: htmlTemplate,
    }

    // Envoyer via le provider configuré
    if (EMAIL_PROVIDER === "sendgrid") {
      const sgMailOptions = {
        to: adminEmails,
        from: process.env.EMAIL_FROM,
        subject: mailOptions.subject,
        html: mailOptions.html,
      }
      await sgMail.send(sgMailOptions)
    } else {
      // Gmail SMTP
      await transporter.sendMail(mailOptions)
    }

    logger.info(`Contact email received from ${email} and sent to ${adminEmails.join(", ")}`)
    return true
  } catch (error) {
    logger.error(`Error sending contact email: ${error.message}`)
    throw error
  }
}

module.exports = {
  sendContactEmail,
}
