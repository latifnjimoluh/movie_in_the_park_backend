const { Reservation, Pack, Payment, Participant } = require("../models")
const logger = require("../config/logger")

module.exports = {
  async getAllReservations(filters) {
    const where = {}
    if (filters.status) where.status = filters.status
    if (filters.pack_id) where.pack_id = filters.pack_id

    return Reservation.findAll({
      where,
      include: [Pack, Payment, Participant],
      order: [["createdAt", "DESC"]],
    })
  },

  async getReservationById(id) {
    return Reservation.findByPk(id, {
      include: [Pack, Payment, Participant],
    })
  },

  async createReservation(data) {
    const { payeur_name, payeur_phone, payeur_email, pack_id, quantity, participants } = data

    const pack = await Pack.findByPk(pack_id)
    if (!pack) {
      throw { status: 404, message: "Pack not found" }
    }

    const total_price = pack.price * quantity
    const reservation = await Reservation.create({
      payeur_name,
      payeur_phone,
      payeur_email,
      pack_id,
      pack_name_snapshot: pack.name,
      unit_price: pack.price,
      quantity,
      total_price,
    })

    if (participants && Array.isArray(participants)) {
      await Promise.all(
        participants.map((p) =>
          Participant.create({
            reservation_id: reservation.id,
            name: p.name,
            email: p.email,
          }),
        ),
      )
    }

    return reservation
  },

  async updateReservation(id, data) {
    const reservation = await Reservation.findByPk(id)
    if (!reservation) {
      throw { status: 404, message: "Reservation not found" }
    }

    await reservation.update(data)
    return reservation
  },
}
