module.exports = {
  "payment.add": (meta) =>
    `Paiement ajouté : ${meta.amount.toLocaleString()} XAF (${meta.method})`,

  "payment.delete": (meta) =>
    `Paiement supprimé : ${meta.amount.toLocaleString()} XAF`,

  "reservation.create": (meta) =>
    `Réservation créée pour ${meta.payeur_name}`,

  "reservation.update": (meta) =>
    `Réservation mise à jour`,

  "ticket.generate": () =>
    `Ticket généré`,

  "entry.validate": (meta) =>
    `Entrée validée (Participants : ${meta.participant_ids?.length || 1})`,
}
