const bcryptjs = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { User } = require("../../models")
const logger = require("../../config/logger")

module.exports = {
  async register(req, res) {
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

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY || "7d",
    })

    logger.info(`New user registered: ${user.email}`)

    res.status(201).json({
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
  },
}
