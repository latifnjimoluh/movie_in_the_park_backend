// scripts/test-smtp.js
require("dotenv").config();
const nodemailer = require("nodemailer");

(async () => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: (process.env.SMTP_SECURE === "true"), // should be false
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: false },
      logger: true,
      debug: true
    });

    console.log("➡️ Starting transporter.verify() ...");
    await transporter.verify();
    console.log("✅ transporter.verify() OK — connexion SMTP possible.");

    // envoi test (optionnel)
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_USER, // s'envoie à soi pour test
      subject: "TEST SMTP Render",
      text: "Test SMTP depuis Render / test-smtp.js",
    });

    console.log("✅ sendMail OK:", info.messageId);
    process.exit(0);
  } catch (err) {
    console.error("❌ ERREUR SMTP :", err);
    // si err.response && err.response.indexOf("530") ou "Authentication" -> auth problem
    process.exit(1);
  }
})();
