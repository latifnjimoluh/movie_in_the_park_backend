const bcryptjs = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { User } = require("../../models")
const logger = require("../../config/logger")

module.exports = {
  async login(req, res) {
    const { email, password } = req.body

    const user = await User.findOne({ where: { email } })

    if (!user || !bcryptjs.compareSync(password, user.password_hash)) {
      logger.warn(`Login attempt failed for email: ${email}`)
      return res.status(401).json({
        status: 401,
        message: "Invalid email or password",
      })
    }

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY || "7d",
    })

    const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRY || "30d",
    })

    logger.info(`User logged in: ${user.email}`)

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
  },
}

