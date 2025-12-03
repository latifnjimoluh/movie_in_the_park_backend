// scripts/test-sendgrid.js
require("dotenv").config();
const sgMail = require("@sendgrid/mail");

(async () => {
  try {
    const key = process.env.SENDGRID_API_KEY;
    const from = process.env.EMAIL_FROM;
    const to = process.env.TEST_TO || process.env.EMAIL_FROM;

    if (!key || !from) {
      console.error("🚨 Variable d'environnement manquante. Définis SENDGRID_API_KEY et EMAIL_FROM.");
      process.exit(1);
    }

    sgMail.setApiKey(key);

    console.log("➡️  Préparation du message SendGrid...");
    const msg = {
      to,
      from,
      subject: "TEST SendGrid depuis Render",
      text: "Test SendGrid : email envoyé depuis scripts/test-sendgrid.js",
      html: "<p>Test SendGrid : <b>email envoyé depuis scripts/test-sendgrid.js</b></p>"
    };

    console.log("➡️  Envoi du message...");
    const res = await sgMail.send(msg);

    // SendGrid renvoie un tableau de réponses (par destinataire)
    console.log("✅ Email envoyé. Réponse SendGrid :", res && res[0] && res[0].statusCode);
    console.log("Headers:", res && res[0] && res[0].headers);
    process.exit(0);
  } catch (error) {
    console.error("❌ ERREUR SendGrid :", error);
    if (error.response && error.response.body) {
      console.error("Détails response.body :", JSON.stringify(error.response.body, null, 2));
    }
    process.exit(1);
  }
})();
