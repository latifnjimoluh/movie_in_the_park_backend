const express = require("express")
const { Pack } = require("../models")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")

const router = express.Router()

router.get("/", async (req, res) => {
  const packs = await Pack.findAll({ where: { is_active: true } })

  res.json({
    status: 200,
    message: "Packs retrieved",
    data: { packs },
  })
})

router.get("/:id", async (req, res) => {
  const pack = await Pack.findByPk(req.params.id)

  if (!pack) {
    return res.status(404).json({
      status: 404,
      message: "Pack not found",
    })
  }

  res.json({
    status: 200,
    message: "Pack retrieved",
    data: { pack },
  })
})

router.post("/", verifyToken, checkPermission("packs.manage"), async (req, res) => {
  const { name, price, description, capacity } = req.body

  const pack = await Pack.create({
    name,
    price,
    description,
    capacity,
  })

  res.status(201).json({
    status: 201,
    message: "Pack created",
    data: { pack },
  })
})

router.put("/:id", verifyToken, checkPermission("packs.manage"), async (req, res) => {
  const { name, price, description, capacity, is_active } = req.body

  const pack = await Pack.findByPk(req.params.id)

  if (!pack) {
    return res.status(404).json({
      status: 404,
      message: "Pack not found",
    })
  }

  await pack.update({
    name: name || pack.name,
    price: price !== undefined ? price : pack.price,
    description: description || pack.description,
    capacity: capacity !== undefined ? capacity : pack.capacity,
    is_active: is_active !== undefined ? is_active : pack.is_active,
  })

  res.json({
    status: 200,
    message: "Pack updated",
    data: { pack },
  })
})

router.delete("/:id", verifyToken, checkPermission("packs.manage"), async (req, res) => {
  const pack = await Pack.findByPk(req.params.id)

  if (!pack) {
    return res.status(404).json({
      status: 404,
      message: "Pack not found",
    })
  }

  await pack.destroy()

  res.json({
    status: 200,
    message: "Pack deleted",
  })
})

module.exports = router
