const PDFDocument = require("pdfkit")
const fs = require("fs")
const path = require("path")

const generateTicketPDF = async (reservation, ticketData, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 })
      const stream = fs.createWriteStream(outputPath)

      doc.pipe(stream)

      // Header
      doc.fontSize(20).font("Helvetica-Bold").text("MOVIE IN THE PARK", { align: "center" })
      doc.fontSize(12).font("Helvetica").text("Ticket d'accès", { align: "center" })
      doc.moveDown()

      // Ticket info
      doc.fontSize(11).font("Helvetica-Bold").text("Numéro du ticket")
      doc.fontSize(10).font("Helvetica").text(ticketData.ticket_number)
      doc.moveDown()

      // Payer info
      doc.fontSize(11).font("Helvetica-Bold").text("Informations du payeur")
      doc.fontSize(10).font("Helvetica")
      doc.text(`Nom: ${reservation.payeur_name}`)
      doc.text(`Téléphone: ${reservation.payeur_phone}`)
      if (reservation.payeur_email) doc.text(`Email: ${reservation.payeur_email}`)
      doc.moveDown()

      // Event details
      doc.fontSize(11).font("Helvetica-Bold").text("Détails de l'événement")
      doc.fontSize(10).font("Helvetica")
      doc.text(`Pack: ${reservation.pack_name_snapshot}`)
      doc.text(`Prix: ${(reservation.total_price / 100).toFixed(2)} XAF`)
      doc.moveDown()

      // Footer
      doc.fontSize(9).font("Helvetica").text(`Généré le ${new Date().toLocaleString()}`, { align: "center" })

      doc.end()

      stream.on("finish", () => resolve(outputPath))
      stream.on("error", (err) => reject(err))
    } catch (err) {
      reject(err)
    }
  })
}

module.exports = { generateTicketPDF }
