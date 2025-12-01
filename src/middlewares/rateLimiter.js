const rateLimit = require("express-rate-limit")

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: "Trop de tentatives de connexion, réessayez plus tard",
  standardHeaders: true,
  legacyHeaders: false,
})

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Trop de requêtes, réessayez plus tard",
})

module.exports = { loginLimiter, apiLimiter }
