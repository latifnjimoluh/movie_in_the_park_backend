const { Pack } = require("../../models")
const logger = require("../../config/logger")

module.exports = {
  async getAll(req, res) {
    const { is_active } = req.query

    const where = {}
    if (is_active !== undefined) where.is_active = is_active === "true"

    const packs = await Pack.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json({
      status: 200,
      message: "Packs retrieved",
      data: packs,
    })
  },

  async create(req, res) {
    const { name, price, description, capacity } = req.body

    const pack = await Pack.create({
      name,
      price,
      description,
      capacity,
    })

    logger.info(`Pack created: ${pack.id}`)

    res.status(201).json({
      status: 201,
      message: "Pack created",
      data: pack,
    })
  },

  async update(req, res) {
    const { id } = req.params
    const { name, price, description, capacity, is_active } = req.body

    const pack = await Pack.findByPk(id)
    if (!pack) {
      return res.status(404).json({
        status: 404,
        message: "Pack not found",
      })
    }

    await pack.update({
      name: name || pack.name,
      price: price || pack.price,
      description: description !== undefined ? description : pack.description,
      capacity: capacity !== undefined ? capacity : pack.capacity,
      is_active: is_active !== undefined ? is_active : pack.is_active,
    })

    logger.info(`Pack updated: ${id}`)

    res.json({
      status: 200,
      message: "Pack updated",
      data: pack,
    })
  },

  async delete(req, res) {
    const { id } = req.params

    const pack = await Pack.findByPk(id)
    if (!pack) {
      return res.status(404).json({
        status: 404,
        message: "Pack not found",
      })
    }

    await pack.destroy()

    logger.info(`Pack deleted: ${id}`)

    res.json({
      status: 200,
      message: "Pack deleted",
    })
  },
}
