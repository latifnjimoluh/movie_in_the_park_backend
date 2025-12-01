const QRCode = require("qrcode")
const path = require("path")
const fs = require("fs")

const qrcodeUtil = {
  async generateQR(data, filename) {
    try {
      const uploadsDir = path.join(__dirname, "../../uploads")
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
      }

      const filepath = path.join(uploadsDir, filename)
      await QRCode.toFile(filepath, data, {
        width: 300,
        margin: 2,
        color: { dark: "#000", light: "#FFF" },
      })
      return filepath
    } catch (err) {
      throw { status: 500, message: "Failed to generate QR code", error: err.message }
    }
  },

  async generateQRDataURL(data) {
    try {
      const qrDataUrl = await QRCode.toDataURL(data, {
        width: 300,
        margin: 2,
        color: { dark: "#000", light: "#FFF" },
      })
      return qrDataUrl
    } catch (err) {
      throw { status: 500, message: "Failed to generate QR code data URL", error: err.message }
    }
  },

  async generateQRBuffer(data) {
    try {
      const buffer = await QRCode.toBuffer(data, {
        width: 300,
        margin: 2,
        color: { dark: "#000", light: "#FFF" },
      })
      return buffer
    } catch (err) {
      throw { status: 500, message: "Failed to generate QR code buffer", error: err.message }
    }
  },
}

module.exports = qrcodeUtil
