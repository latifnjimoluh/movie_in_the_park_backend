const express = require("express")
const { validate } = require("../middlewares/validation")
const { create } = require("../controllers/userController")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { createUserSchema } = require("../middlewares/validation")
const { list } = require("../controllers/userController")

const router = express.Router()

// Create user (only users with users.manage)
router.post("/", verifyToken, checkPermission("users.manage"), validate(createUserSchema), create)

// List users
router.get("/", verifyToken, checkPermission("users.manage"), list)

module.exports = router
