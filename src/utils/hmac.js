const crypto = require("crypto")

const generateSignature = (data, secret) => {
  if (!secret) {
    throw new Error("Encryption key (QR_SECRET) is not defined in environment variables")
  }
  if (typeof secret !== "string") {
    throw new Error(`Encryption key must be a string, received ${typeof secret}`)
  }
  return crypto.createHmac("sha256", secret).update(data).digest("hex")
}

const verifySignature = (data, signature, secret) => {
  if (!secret) {
    throw new Error("Encryption key (QR_SECRET) is not defined in environment variables")
  }
  if (typeof secret !== "string") {
    throw new Error(`Encryption key must be a string, received ${typeof secret}`)
  }
  const expectedSignature = generateSignature(data, secret)
  return signature === expectedSignature
}

const generateQRPayload = (ticketNumber, reservationId, secret) => {
  if (!secret) {
    throw new Error("Cannot generate QR payload: QR_SECRET environment variable is missing")
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const dataString = `${ticketNumber}|${reservationId}|${timestamp}`
  const signature = generateSignature(dataString, secret)

  return {
    ticket_number: ticketNumber,
    reservation_id: reservationId,
    timestamp,
    signature,
  }
}

module.exports = { generateSignature, verifySignature, generateQRPayload }
