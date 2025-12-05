const { Pack } = require("../../models")
const logger = require("../../config/logger")
const auditService = require("../../services/auditService")

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

    await auditService.log({
      userId: req.user.id,
      permission: "packs.create",
      entityType: "pack",
      entityId: pack.id,
      action: "create",
      description: `Forfait "${name}" créé avec un prix de ${price} XAF`,
      changes: { name, price, description, capacity },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

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

    const changes = {}
    if (name !== undefined && name !== pack.name) changes.name = { from: pack.name, to: name }
    if (price !== undefined && price !== pack.price) changes.price = { from: pack.price, to: price }
    if (description !== undefined && description !== pack.description)
      changes.description = { from: pack.description, to: description }
    if (capacity !== undefined && capacity !== pack.capacity) changes.capacity = { from: pack.capacity, to: capacity }
    if (is_active !== undefined && is_active !== pack.is_active)
      changes.is_active = { from: pack.is_active, to: is_active }

    await pack.update({
      name: name || pack.name,
      price: price || pack.price,
      description: description !== undefined ? description : pack.description,
      capacity: capacity !== undefined ? capacity : pack.capacity,
      is_active: is_active !== undefined ? is_active : pack.is_active,
    })

    logger.info(`Pack updated: ${id}`)

    if (Object.keys(changes).length > 0) {
      await auditService.log({
        userId: req.user.id,
        permission: "packs.edit",
        entityType: "pack",
        entityId: id,
        action: "update",
        description: `Forfait "${pack.name}" modifié`,
        changes,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })
    }

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

    const packName = pack.name

    await pack.destroy()

    logger.info(`Pack deleted: ${id}`)

    await auditService.log({
      userId: req.user.id,
      permission: "packs.delete",
      entityType: "pack",
      entityId: id,
      action: "delete",
      description: `Forfait "${packName}" supprimé`,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.json({
      status: 200,
      message: "Pack deleted",
    })
  },
}
