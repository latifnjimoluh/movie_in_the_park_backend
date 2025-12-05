const bcryptjs = require("bcryptjs")
const { User } = require("../models")
const logger = require("../config/logger")
const auditService = require("../services/auditService")

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

      logger.info(`User created: ${user.id}`)

      await auditService.log({
        userId: req.user.id,
        permission: "users.create",
        entityType: "user",
        entityId: user.id,
        action: "create",
        description: `Nouvel administrateur créé: ${name} (${role})`,
        changes: {
          name,
          email,
          phone,
          role,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
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
      const userId = req.userId || (req.user && req.user.id)
      if (!userId) {
        return res.status(401).json({ status: 401, message: "Utilisateur non authentifié" })
      }

      const user = await User.findByPk(userId, {
        attributes: ["id", "name", "email", "phone", "role", "last_login", "createdAt"],
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
        attributes: ["id", "name", "email", "phone", "role", "last_login", "createdAt"],
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
      const userId = req.user.id
      const { oldPassword, newPassword } = req.body

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          status: 400,
          message: "oldPassword and newPassword are required",
        })
      }

      const user = await User.findByPk(userId)

      if (!user) {
        return res.status(404).json({
          status: 404,
          message: "User not found",
        })
      }

      const isMatch = bcryptjs.compareSync(oldPassword, user.password_hash)

      if (!isMatch) {
        return res.status(401).json({
          status: 401,
          message: "Ancien mot de passe incorrect",
        })
      }

      const newHash = bcryptjs.hashSync(newPassword, 10)

      user.password_hash = newHash
      await user.save()

      await auditService.log({
        userId,
        permission: "users.edit.password",
        entityType: "user",
        entityId: userId,
        action: "update_password",
        description: `Mot de passe modifié`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

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

      const userName = user.name

      await user.destroy()

      logger.info(`User deleted: ${id}`)

      await auditService.log({
        userId: req.user.id,
        permission: "users.delete",
        entityType: "user",
        entityId: id,
        action: "delete",
        description: `Administrateur supprimé: ${userName}`,
        changes: {
          deleted_user: userName,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

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

  // ============================
  // 🔧 UPDATE USER ROLE (SUPERADMIN ONLY)
  // ============================
  async updateRole(req, res) {
    try {
      const { id } = req.params
      const { role } = req.body

      if (!role || !["superadmin", "admin", "cashier", "scanner", "operator"].includes(role)) {
        return res.status(400).json({
          status: 400,
          message: "Invalid role provided",
        })
      }

      const user = await User.findByPk(id)

      if (!user) {
        return res.status(404).json({
          status: 404,
          message: "User not found",
        })
      }

      const oldRole = user.role

      await user.update({ role })

      logger.info(`User role updated: ${id}`)

      await auditService.log({
        userId: req.user.id,
        permission: "users.edit.role",
        entityType: "user",
        entityId: id,
        action: "update_role",
        description: `Rôle de ${user.name} modifié de ${oldRole} à ${role}`,
        changes: {
          old_role: oldRole,
          new_role: role,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      res.json({
        status: 200,
        message: "User role updated successfully",
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      })
    } catch (err) {
      logger.error("Error updating user role:", err)
      res.status(500).json({
        status: 500,
        message: "Failed to update user role",
      })
    }
  },
}
