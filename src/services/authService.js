const bcryptjs = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { User } = require("../models")
const logger = require("../config/logger")

module.exports = {
  async authenticate(email, password) {
    const user = await User.findOne({ where: { email } })

    if (!user || !bcryptjs.compareSync(password, user.password_hash)) {
      throw { status: 401, message: "Invalid email or password" }
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY || "7d",
    })

    const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRY || "30d",
    })

    logger.info(`User authenticated: ${user.email}`)

    return {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    }
  },

  async registerUser(data) {
    const { email, password, name, phone, role } = data

    const existingUser = await User.findOne({ where: { email } })
    if (existingUser) {
      throw { status: 409, message: "Email already in use" }
    }

    const password_hash = bcryptjs.hashSync(password, 10)

    const user = await User.create({
      email,
      password_hash,
      name,
      phone,
      role: role || "cashier",
    })

    logger.info(`New user registered: ${user.email}`)

    return user
  },

  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
      const user = await User.findByPk(decoded.id)

      if (!user) {
        throw { status: 401, message: "User not found" }
      }

      const newToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRY || "7d",
      })

      return { token: newToken }
    } catch (err) {
      logger.error("Token refresh failed:", err.message)
      throw { status: 401, message: "Invalid refresh token" }
    }
  },
}
