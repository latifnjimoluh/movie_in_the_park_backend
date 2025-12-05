const { sequelize } = require("../models")
const { Reservation, Payment, ActionLog, ActivityLog } = require("../models")
const logger = require("../config/logger")
const descriptions = require("../utils/actionDescriptions")
const path = require("path")
const fs = require("fs").promises

// -------------------------------------------------------------
// 🔵 ADD PAYMENT
// -------------------------------------------------------------
const addPayment = async (reservationId, paymentData, userId, proofFile = null, ipAddress = null, userAgent = null) => {
  const transaction = await sequelize.transaction()

  try {
    const reservation = await Reservation.findByPk(reservationId, {
      lock: true,
      transaction,
    })

    if (!reservation) {
      throw { status: 404, message: "Reservation not found" }
    }

    if (reservation.status === "cancelled") {
      throw { status: 409, message: "Cannot add payment to cancelled reservation" }
    }

    const remainingAmount = reservation.total_price - reservation.total_paid

    // ✅ Vérification si le montant dépasse le montant restant
    if (paymentData.amount > remainingAmount) {
      throw {
        status: 409,
        message: `Le montant saisi (${paymentData.amount} XAF) dépasse le montant restant (${remainingAmount} XAF)`,
      }
    }

    // ✅ Gestion de l'upload de la preuve de paiement
    let proofPath = null
    if (proofFile) {
      const uploadsDir = path.join(__dirname, "..", "uploads", "payment-proofs")

      // Créer le dossier s'il n'existe pas
      try {
        await fs.access(uploadsDir)
      } catch {
        await fs.mkdir(uploadsDir, { recursive: true })
      }

      const fileExtension = path.extname(proofFile.originalname)
      const filename = `proof-${reservationId}-${Date.now()}${fileExtension}`
      const fullPath = path.join(uploadsDir, filename)

      await fs.writeFile(fullPath, proofFile.buffer)
      proofPath = `/uploads/payment-proofs/${filename}`
    }

    const payment = await Payment.create(
      {
        reservation_id: reservationId,
        amount: paymentData.amount,
        method: paymentData.method,
        comment: paymentData.comment,
        proof_url: proofPath,
        created_by: userId,
      },
      { transaction },
    )

    const newTotalPaid = reservation.total_paid + paymentData.amount
    let newStatus = "pending"

    if (newTotalPaid > 0 && newTotalPaid < reservation.total_price) {
      newStatus = "partial"
    } else if (newTotalPaid >= reservation.total_price) {
      newStatus = "paid"
    }

    await reservation.update({ total_paid: newTotalPaid, status: newStatus }, { transaction })

    // ✅ Mapping des méthodes de paiement en français
    const methodLabels = {
      cash: "espèces",
      momo: "Mobile Money",
      orange: "Orange Money",
    }

    // -------------------------------------------------------------
    // 🟢 ACTION LOG (lisible par un non technicien)
    // -------------------------------------------------------------
    await ActionLog.create(
      {
        user_id: userId,
        reservation_id: reservationId,
        action_type: "payment.add",
        meta: {
          payment_id: payment.id,
          amount: paymentData.amount,
          method: paymentData.method,
        },
        description: `Un paiement de ${paymentData.amount} XAF a été enregistré (${methodLabels[paymentData.method] || paymentData.method})`,
      },
      { transaction },
    )

    // -------------------------------------------------------------
    // 🟣 ACTIVITY LOG (Audit détaillé)
    // -------------------------------------------------------------
    await ActivityLog.create(
      {
        user_id: userId,
        permission: "payments.create",
        entity_type: "payment",
        entity_id: payment.id,
        action: "create",
        description: `Paiement de ${paymentData.amount} XAF enregistré pour la réservation ${reservation.reservation_number} via ${methodLabels[paymentData.method] || paymentData.method}`,
        changes: {
          payment_id: payment.id,
          reservation_id: reservationId,
          reservation_number: reservation.reservation_number,
          amount: paymentData.amount,
          method: paymentData.method,
          comment: paymentData.comment,
          has_proof: !!proofPath,
          previous_total_paid: reservation.total_paid,
          new_total_paid: newTotalPaid,
          previous_status: reservation.status,
          new_status: newStatus,
        },
        status: "success",
        ip_address: ipAddress,
        user_agent: userAgent,
      },
      { transaction },
    )

    await transaction.commit()

    return {
      payment: payment.toJSON(),
      reservation: {
        id: reservation.id,
        total_paid: newTotalPaid,
        remaining_amount: reservation.total_price - newTotalPaid,
        status: newStatus,
      },
    }
  } catch (err) {
    await transaction.rollback()
    logger.error("Payment error:", err)
    throw err
  }
}

// -------------------------------------------------------------
// 🔴 DELETE PAYMENT
// -------------------------------------------------------------
const deletePayment = async (paymentId, reservationId, userId, ipAddress = null, userAgent = null) => {
  const transaction = await sequelize.transaction()

  try {
    const payment = await Payment.findByPk(paymentId, { transaction })

    if (!payment) {
      throw { status: 404, message: "Payment not found" }
    }

    const reservation = await Reservation.findByPk(reservationId, {
      lock: true,
      transaction,
    })

    if (!reservation) {
      throw { status: 404, message: "Reservation not found" }
    }

    if (reservation.status === "ticket_generated") {
      throw { status: 409, message: "Cannot delete payment after ticket generation" }
    }

    // ✅ Supprimer le fichier de preuve s'il existe
    if (payment.proof_url) {
      const filePath = path.join(__dirname, "..", payment.proof_url)
      try {
        await fs.unlink(filePath)
      } catch (err) {
        logger.warn("Could not delete proof file:", err)
      }
    }

    const newTotalPaid = reservation.total_paid - payment.amount
    let newStatus = "pending"

    if (newTotalPaid > 0 && newTotalPaid < reservation.total_price) {
      newStatus = "partial"
    } else if (newTotalPaid >= reservation.total_price) {
      newStatus = "paid"
    }

    // Mapping des méthodes de paiement en français
    const methodLabels = {
      cash: "espèces",
      momo: "Mobile Money",
      orange: "Orange Money",
    }

    // -------------------------------------------------------------
    // 🟡 ACTION LOG (lisible par un non technicien)
    // -------------------------------------------------------------
    await ActionLog.create(
      {
        user_id: userId,
        reservation_id: reservationId,
        action_type: "payment.delete",
        meta: {
          payment_id: paymentId,
          amount: payment.amount,
        },
        description: `Un paiement de ${payment.amount} XAF a été annulé`,
      },
      { transaction },
    )

    // -------------------------------------------------------------
    // 🟣 ACTIVITY LOG (Audit détaillé)
    // -------------------------------------------------------------
    await ActivityLog.create(
      {
        user_id: userId,
        permission: "payments.delete",
        entity_type: "payment",
        entity_id: paymentId,
        action: "delete",
        description: `Paiement de ${payment.amount} XAF annulé pour la réservation ${reservation.reservation_number} (${methodLabels[payment.method] || payment.method})`,
        changes: {
          payment_id: paymentId,
          reservation_id: reservationId,
          reservation_number: reservation.reservation_number,
          amount: payment.amount,
          method: payment.method,
          comment: payment.comment,
          had_proof: !!payment.proof_url,
          previous_total_paid: reservation.total_paid,
          new_total_paid: newTotalPaid,
          previous_status: reservation.status,
          new_status: newStatus,
        },
        status: "success",
        ip_address: ipAddress,
        user_agent: userAgent,
      },
      { transaction },
    )

    await payment.destroy({ transaction })
    await reservation.update({ total_paid: newTotalPaid, status: newStatus }, { transaction })

    await transaction.commit()

    return {
      message: "Payment deleted",
      reservation: {
        id: reservation.id,
        total_paid: newTotalPaid,
        remaining_amount: reservation.total_price - newTotalPaid,
        status: newStatus,
      },
    }
  } catch (err) {
    await transaction.rollback()
    logger.error("Delete payment error:", err)
    throw err
  }
}

module.exports = { addPayment, deletePayment }