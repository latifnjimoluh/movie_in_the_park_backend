const bcryptjs = require("bcryptjs")
const { User } = require("../models")
const logger = require("../config/logger")

module.exports = {
  async create(req, res) {
    try {
      const { name, email, password, role, phone } = req.validatedData || req.body

      // Hash password
      const password_hash = bcryptjs.hashSync(password, 10)

      const user = await User.create({
        name,
        email,
        phone,
        role,
        password_hash,
      })

      res.status(201).json({
        status: 201,
        message: "User created",
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          created_at: user.createdAt,
        },
      })
    } catch (err) {
      logger.error("Error creating user:", err)
      if (err.name === "SequelizeUniqueConstraintError") {
        return res.status(409).json({ status: 409, message: "Email already in use" })
      }
      res.status(500).json({ status: 500, message: "Failed to create user" })
    }
  },

  async list(req, res) {
    try {
      const users = await User.findAll({ attributes: ["id", "name", "email", "phone", "role", "createdAt"] })
      res.json({ status: 200, message: "Users retrieved", data: users })
    } catch (err) {
      logger.error("Error fetching users:", err)
      res.status(500).json({ status: 500, message: "Failed to fetch users" })
    }
  },
}
