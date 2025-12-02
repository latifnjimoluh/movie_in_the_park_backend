const bcryptjs = require("bcryptjs")
const { User } = require("../models")
const logger = require("../config/logger")

module.exports = {
  async create(req, res) {
    try {
      const { name, email, role, phone } = req.validatedData || req.body

      const defaultPassword = "admin123"
      const password_hash = bcryptjs.hashSync(defaultPassword, 10)

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
          defaultPassword: "admin123",
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

    async me(req, res) {
      try {
        // Supposition : ton middleware verifyToken met userId dans req.userId
        const userId = req.userId || (req.user && req.user.id)
        if (!userId) {
          return res.status(401).json({ status: 401, message: "Utilisateur non authentifié" })
        }

        const user = await User.findByPk(userId, {
          attributes: ["id", "name", "email", "phone", "role", "createdAt"],
        })

        if (!user) {
          return res.status(404).json({ status: 404, message: "Utilisateur introuvable" })
        }

        return res.json({ status: 200, data: user })
      } catch (err) {
        logger.error("Error fetching current user:", err)
        return res.status(500).json({ status: 500, message: "Erreur serveur" })
      }
    },


  async list(req, res) {
    try {
      const users = await User.findAll({
        attributes: ["id", "name", "email", "phone", "role", "createdAt"],
      })

      res.json({ status: 200, message: "Users retrieved", data: users })
    } catch (err) {
      logger.error("Error fetching users:", err)
      res.status(500).json({ status: 500, message: "Failed to fetch users" })
    }
  },

  // ============================
  // 🔥 UPDATE PASSWORD
  // ============================
  async updatePassword(req, res) {
    try {
      const userId = req.user.id  // Récupéré depuis verifyToken
      const { oldPassword, newPassword } = req.body

      // Vérifier si les champs sont présents
      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          status: 400,
          message: "oldPassword and newPassword are required",
        })
      }

      // Récupérer l’utilisateur
      const user = await User.findByPk(userId)

      if (!user) {
        return res.status(404).json({
          status: 404,
          message: "User not found",
        })
      }

      // Vérifier l'ancien mot de passe
      const isMatch = bcryptjs.compareSync(oldPassword, user.password_hash)

      if (!isMatch) {
        return res.status(401).json({
          status: 401,
          message: "Ancien mot de passe incorrect",
        })
      }

      // Hash du nouveau mot de passe
      const newHash = bcryptjs.hashSync(newPassword, 10)

      // Mise à jour
      user.password_hash = newHash
      await user.save()

      res.json({
        status: 200,
        message: "Mot de passe mis à jour avec succès",
      })
    } catch (err) {
      logger.error("Error updating password:", err)
      res.status(500).json({
        status: 500,
        message: "Failed to update password",
      })
    }
  },

  // ============================
  // 🗑️ DELETE USER
  // ============================
  async deleteUser(req, res) {
    try {
      const { id } = req.params

      const user = await User.findByPk(id)

      if (!user) {
        return res.status(404).json({
          status: 404,
          message: "User not found",
        })
      }

      await user.destroy()

      res.json({
        status: 200,
        message: "User deleted successfully",
      })
    } catch (err) {
      logger.error("Error deleting user:", err)
      res.status(500).json({
        status: 500,
        message: "Failed to delete user",
      })
    }
  },
}
