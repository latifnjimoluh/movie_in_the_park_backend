const crypto = require("crypto")

const generateSignature = (data, secret) => {
  return crypto.createHmac("sha256", secret).update(data).digest("hex")
}

const verifySignature = (data, signature, secret) => {
  const expectedSignature = generateSignature(data, secret)
  return signature === expectedSignature
}

const generateQRPayload = (ticketNumber, reservationId, secret) => {
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
