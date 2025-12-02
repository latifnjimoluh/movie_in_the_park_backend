const express = require("express")
const { validate } = require("../middlewares/validation")
const { create, list, deleteUser, updatePassword, me } = require("../controllers/userController")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/permissions")
const { createUserSchema } = require("../middlewares/validation")

const router = express.Router()

// Create user
router.post(
  "/",
  verifyToken,
  checkPermission("users.manage"),
  validate(createUserSchema),
  create
)

router.get("/me", verifyToken, me)



// List users
router.get(
  "/",
  verifyToken,
  checkPermission("users.manage"),
  list
)

router.put("/password", verifyToken, updatePassword)

// Delete user
router.delete(
  "/:id",
  verifyToken,
  checkPermission("users.manage"),
  deleteUser
)

module.exports = router
