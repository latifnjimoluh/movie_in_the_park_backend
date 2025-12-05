const express = require("express")
const packController = require("../controllers/packs/packController")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")

const router = express.Router()

router.get("/", packController.getAll)

router.get("/:id", async (req, res) => {
  const { Pack } = require("../models")
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
    data: pack,
  })
})

router.post("/", verifyToken, checkPermission("packs.create"), packController.create)

router.put("/:id", verifyToken, checkPermission("packs.edit"), packController.update)

router.delete("/:id", verifyToken, checkPermission("packs.delete"), packController.delete)

module.exports = router
