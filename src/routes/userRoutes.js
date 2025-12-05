const express = require("express")
const { validate } = require("../middlewares/validation")
const { create, list, deleteUser, updatePassword, me, updateRole } = require("../controllers/userController")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { createUserSchema } = require("../middlewares/validation")

const router = express.Router()

// Create user
router.post("/", verifyToken, checkPermission("users.create"), validate(createUserSchema), create)

router.get("/me", verifyToken, me)

// List users
router.get("/", verifyToken, checkPermission("users.view.all"), list)

router.put("/password", verifyToken, updatePassword)

router.put("/:id/role", verifyToken, checkPermission("users.edit.role"), updateRole)

// Delete user
router.delete("/:id", verifyToken, checkPermission("users.delete"), deleteUser)

module.exports = router
