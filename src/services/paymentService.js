const { sequelize } = require("../models");
const { Reservation, Payment, ActionLog } = require("../models");
const logger = require("../config/logger");
const path = require("path");
const fs = require("fs").promises;
const { sendPaymentConfirmationEmail } = require("./emailService");

/* =======================================================================
   🔵 ADD PAYMENT — Version finale stabilisée + Anti-double paiement
======================================================================= */
const addPayment = async (reservationId, paymentData, userId, proofFile = null) => {
  const transaction = await sequelize.transaction();

  try {
    logger.info("addPayment called:", {
      reservationId,
      paymentData,
      userId,
      hasProofFile: !!proofFile,
    });

    /* ==========================================================
       1️⃣ SANITIZE + VALIDER LES DONNÉES
    ========================================================== */

    // Montant doit toujours être un nombre
    paymentData.amount = Number(paymentData.amount);

    if (isNaN(paymentData.amount) || paymentData.amount <= 0) {
      throw { status: 400, message: "Montant invalide" };
    }

    if (!paymentData.method) throw { status: 400, message: "Method is required" };


    /* ==========================================================
       2️⃣ LOCK RESERVATION (empêche race conditions)
    ========================================================== */
    const reservation = await Reservation.findByPk(reservationId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!reservation) throw { status: 404, message: "Reservation not found" };
    if (reservation.status === "cancelled")
      throw { status: 409, message: "Impossible d'ajouter un paiement sur une réservation annulée" };


    /* ==========================================================
       3️⃣ ANTI DOUBLE-PAIEMENT (empêche plusieurs insertions)
    ========================================================== */
    const lastPayment = await Payment.findOne({
      where: { reservation_id: reservationId },
      order: [["createdAt", "DESC"]],
      transaction,
    });

    if (lastPayment) {
      const diff = Date.now() - new Date(lastPayment.createdAt).getTime();
      if (diff < 2000) {
        throw {
          status: 429,
          message: "Veuillez patienter 2 secondes avant un nouveau paiement",
        };
      }
    }


    /* ==========================================================
       4️⃣ VALIDATION MONTANT RESTANT
    ========================================================== */
    const remainingAmount = reservation.total_price - reservation.total_paid;

    if (paymentData.amount > remainingAmount) {
      throw {
        status: 409,
        message: `Le montant (${paymentData.amount} XAF) dépasse le montant restant (${remainingAmount} XAF)`,
      };
    }


    /* ==========================================================
       5️⃣ UPLOAD FICHIER (OPTIONNEL)
    ========================================================== */
    let proofPath = null;
    if (proofFile && proofFile.buffer) {
      const uploadsDir = path.join(__dirname, "..", "uploads", "payment-proofs");

      // Création du dossier si absent
      try {
        await fs.access(uploadsDir);
      } catch {
        await fs.mkdir(uploadsDir, { recursive: true });
      }

      const ext = path.extname(proofFile.originalname);
      const filename = `payment-${reservationId}-${Date.now()}${ext}`;
      const fullPath = path.join(uploadsDir, filename);

      await fs.writeFile(fullPath, proofFile.buffer);

      proofPath = `/uploads/payment-proofs/${filename}`;
    }


    /* ==========================================================
       6️⃣ CREATION DU PAIEMENT
    ========================================================== */
    const payment = await Payment.create(
      {
        reservation_id: reservationId,
        amount: paymentData.amount,
        method: paymentData.method,
        comment: paymentData.comment,
        proof_url: proofPath,
        created_by: userId,
      },
      { transaction }
    );

    const newTotalPaid = reservation.total_paid + paymentData.amount;

    let newStatus = "pending";
    if (newTotalPaid >= reservation.total_price) newStatus = "paid";
    else if (newTotalPaid > 0) newStatus = "partial";


    /* ==========================================================
       7️⃣ METTRE À JOUR LA RÉSERVATION
    ========================================================== */
    await reservation.update(
      {
        total_paid: newTotalPaid,
        status: newStatus,
      },
      { transaction }
    );


    /* ==========================================================
       8️⃣ ACTION LOG
    ========================================================== */
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
        description: `Un paiement de ${paymentData.amount} XAF a été enregistré (${paymentData.method})`,
      },
      { transaction }
    );


    /* ==========================================================
       9️⃣ COMMIT
    ========================================================== */
    await transaction.commit();


    /* ==========================================================
       🔟 ENVOI EMAIL (ASYNCHRONE, NE BLOQUE PAS LE FRONT)
    ========================================================== */
    const allPayments = await Payment.findAll({
      where: { reservation_id: reservationId },
      order: [["createdAt", "DESC"]],
    });

    const freshReservation = await Reservation.findByPk(reservationId);

    setImmediate(async () => {
      try {
        await sendPaymentConfirmationEmail(freshReservation, payment, allPayments);
      } catch (emailErr) {
        logger.error("Async email send error:", emailErr);
      }
    });


    /* ==========================================================
       🔚 RÉPONSE
    ========================================================== */
    return {
      payment: payment.toJSON(),
      reservation: {
        id: reservationId,
        total_paid: newTotalPaid,
        remaining_amount: reservation.total_price - newTotalPaid,
        status: newStatus,
      },
    };

  } catch (err) {
    await transaction.rollback();
    logger.error("Payment error:", err);
    throw err;
  }
};


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

    await payment.destroy({ transaction })

    await reservation.update({ total_paid: newTotalPaid, status: newStatus }, { transaction })

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
