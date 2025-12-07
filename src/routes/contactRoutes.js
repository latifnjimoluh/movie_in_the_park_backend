const express = require("express")
const router = express.Router()
const { sendContactEmail } = require("../services/contactService")
const logger = require("../config/logger")

// Map pour tracker l'anti-spam par IP
const rateLimitMap = new Map()

/**
 * Middleware anti-spam : 1 message par 30 secondes par IP
 */
const rateLimitMiddleware = (req, res, next) => {
  const clientIp = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress
  const now = Date.now()
  const lastContactTime = rateLimitMap.get(clientIp)

  if (lastContactTime && now - lastContactTime < 30000) {
    return res.status(429).json({
      success: false,
      message: "Trop de messages. Veuillez attendre 30 secondes avant de réessayer.",
    })
  }

  rateLimitMap.set(clientIp, now)
  req.clientIp = clientIp
  next()
}

/**
 * POST /contact
 * Envoyer un message de contact
 */
router.post("/", rateLimitMiddleware, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body

    // Validation
    if (!email || email.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Email est obligatoire.",
      })
    }

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Le message est obligatoire.",
      })
    }

    // Validation email basique
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Email invalide.",
      })
    }

    // Envoyer l'email
    const contactData = {
      name: name || "Non spécifié",
      email,
      phone: phone || "",
      subject: subject || "Sans objet",
      message,
      clientIp: req.clientIp,
    }

    await sendContactEmail(contactData)

    res.status(200).json({
      success: true,
      message: "Message envoyé avec succès. Nous vous répondrons rapidement.",
    })
  } catch (error) {
    logger.error(`Contact route error: ${error.message}`)
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue. Veuillez réessayer plus tard.",
    })
  }
})

module.exports = router
