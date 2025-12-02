const { sequelize } = require("../models")
const { Reservation, Payment, ActionLog } = require("../models")
const logger = require("../config/logger")
const descriptions = require("../utils/actionDescriptions")

// -------------------------------------------------------------
// 🔵 ADD PAYMENT
// -------------------------------------------------------------
const addPayment = async (reservationId, paymentData, userId) => {
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
    if (paymentData.amount > remainingAmount) {
      throw {
        status: 409,
        message: `Payment amount exceeds remaining balance (${remainingAmount} XAF)`,
      }
    }

    const payment = await Payment.create(
      {
        reservation_id: reservationId,
        amount: paymentData.amount,
        method: paymentData.method,
        comment: paymentData.comment,
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

    await reservation.update(
      { total_paid: newTotalPaid, status: newStatus },
      { transaction },
    )

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
        description: descriptions["payment.add"]({
          amount: paymentData.amount,
          method: paymentData.method,
        }),
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
const deletePayment = async (paymentId, reservationId, userId) => {
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

    const newTotalPaid = reservation.total_paid - payment.amount
    let newStatus = "pending"

    if (newTotalPaid > 0 && newTotalPaid < reservation.total_price) {
      newStatus = "partial"
    } else if (newTotalPaid >= reservation.total_price) {
      newStatus = "paid"
    }

    await payment.destroy({ transaction })

    await reservation.update(
      { total_paid: newTotalPaid, status: newStatus },
      { transaction },
    )

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
        description: descriptions["payment.delete"]({
          amount: payment.amount,
        }),
      },
      { transaction },
    )

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
