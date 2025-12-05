const express = require("express")
const bcryptjs = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { User } = require("../models")
const { verifyRefreshToken } = require("../middlewares/auth")
const { validate, loginSchema } = require("../middlewares/validation")

const router = express.Router()

// ---------------------- REGISTER ----------------------
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, phone, role } = req.body

    const existingUser = await User.findOne({ where: { email } })
    if (existingUser) {
      return res.status(409).json({
        status: 409,
        message: "Email already in use",
      })
    }

    const password_hash = bcryptjs.hashSync(password, 10)

    const user = await User.create({
      email,
      password_hash,
      name,
      phone,
      role: role || "cashier",
    })

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "24h" }
    )

    return res.status(201).json({
      status: 201,
      message: "User registered successfully",
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    })
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// ---------------------- LOGIN ----------------------
// ---------------------- LOGIN ----------------------
router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.validatedData

  const user = await User.findOne({ where: { email } })

  if (!user || !bcryptjs.compareSync(password, user.password_hash)) {
    return res.status(401).json({
      status: 401,
      message: "Invalid email or password",
    })
  }

  // ➤ AJOUT ICI : update last_login
  await user.update({ last_login: new Date() })

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "24h" }
  )

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || "7d" }
  )

  res.json({
    status: 200,
    message: "Login successful",
    data: {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    },
  })
})


// ---------------------- REFRESH ----------------------
router.post("/refresh", verifyRefreshToken, async (req, res) => {
  const user = await User.findByPk(req.user.id)

  if (!user) {
    return res.status(401).json({
      status: 401,
      message: "User not found",
    })
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "24h",
  })

  res.json({
    status: 200,
    message: "Token refreshed",
    data: { token },
  })
})

// ---------------------- LOGOUT ----------------------
router.post("/logout", (req, res) => {
  res.json({
    status: 200,
    message: "Logout successful",
  })
})

module.exports = router
