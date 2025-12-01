const { Pack, Reservation } = require("../models")
const logger = require("../config/logger")

module.exports = {
  async getAllPacks(active = true) {
    const where = active !== undefined ? { is_active: active } : {}
    return Pack.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })
  },

  async getPackById(id) {
    return Pack.findByPk(id, {
      include: [{ model: Reservation, as: "reservations" }],
    })
  },

  async createPack(data) {
    const { name, price, description, capacity } = data

    const pack = await Pack.create({
      name,
      price,
      description,
      capacity,
    })

    logger.info(`Pack created: ${pack.id}`)
    return pack
  },

  async updatePack(id, data) {
    const pack = await Pack.findByPk(id)
    if (!pack) {
      throw { status: 404, message: "Pack not found" }
    }

    await pack.update(data)
    logger.info(`Pack updated: ${id}`)
    return pack
  },

  async deletePack(id) {
    const pack = await Pack.findByPk(id)
    if (!pack) {
      throw { status: 404, message: "Pack not found" }
    }

    await pack.destroy()
    logger.info(`Pack deleted: ${id}`)
    return pack
  },
}
