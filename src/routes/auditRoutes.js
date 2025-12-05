const express = require("express")
const { verifyToken } = require("../middlewares/auth")
const { checkPermission } = require("../middlewares/checkPermission")
const auditService = require("../services/auditService")

const router = express.Router()

/**
 * GET /api/audit/logs
 * Récupérer tous les logs d'audit (Superadmin seulement)
 */
router.get("/logs", verifyToken, checkPermission("audit.view.all"), async (req, res) => {
  try {
    const { limit = 100, offset = 0, userId, permission, entityType, action, status } = req.query

    const filters = {
      userId: userId || null,
      permission: permission || null,
      entityType: entityType || null,
      action: action || null,
      status: status || null,
    }

    const logs = await auditService.getAllLogs(Number.parseInt(limit), Number.parseInt(offset), filters)

    res.json({
      data: logs.rows,
      total: logs.count,
      limit: Number.parseInt(limit),
      offset: Number.parseInt(offset),
    })
  } catch (err) {
    res.status(err.status || 500).json({
      status: err.status || 500,
      message: err.message || "Failed to fetch audit logs",
    })
  }
})

/**
 * GET /api/audit/user/:userId
 * Récupérer les logs d'un utilisateur spécifique
 */
router.get("/user/:userId", verifyToken, checkPermission("audit.view.user"), async (req, res) => {
  try {
    const { userId } = req.params
    const { limit = 50, offset = 0 } = req.query

    // Vérifier que l'utilisateur ne peut voir que ses propres logs sauf s'il est superadmin
    if (req.user.role !== "superadmin" && req.user.id !== userId) {
      return res.status(403).json({
        status: 403,
        message: "Unauthorized",
      })
    }

    const logs = await auditService.getUserLogs(userId, Number.parseInt(limit), Number.parseInt(offset))

    res.json({
      data: logs.rows,
      total: logs.count,
      limit: Number.parseInt(limit),
      offset: Number.parseInt(offset),
    })
  } catch (err) {
    res.status(err.status || 500).json({
      status: err.status || 500,
      message: err.message || "Failed to fetch user logs",
    })
  }
})

/**
 * GET /api/audit/entity/:entityType/:entityId
 * Récupérer les logs d'une entité spécifique
 */
router.get("/entity/:entityType/:entityId", verifyToken, checkPermission("audit.view.entity"), async (req, res) => {
  try {
    const { entityType, entityId } = req.params
    const { limit = 50, offset = 0 } = req.query

    const logs = await auditService.getEntityLogs(entityType, entityId, Number.parseInt(limit), Number.parseInt(offset))

    res.json({
      data: logs.rows,
      total: logs.count,
      limit: Number.parseInt(limit),
      offset: Number.parseInt(offset),
    })
  } catch (err) {
    res.status(err.status || 500).json({
      status: err.status || 500,
      message: err.message || "Failed to fetch entity logs",
    })
  }
})

/**
 * GET /api/audit/permission/:permission
 * Récupérer les logs par permission
 */
router.get("/permission/:permission", verifyToken, checkPermission("audit.view.all"), async (req, res) => {
  try {
    const { permission } = req.params
    const { limit = 50, offset = 0 } = req.query

    const logs = await auditService.getLogsByPermission(permission, Number.parseInt(limit), Number.parseInt(offset))

    res.json({
      data: logs.rows,
      total: logs.count,
      limit: Number.parseInt(limit),
      offset: Number.parseInt(offset),
    })
  } catch (err) {
    res.status(err.status || 500).json({
      status: err.status || 500,
      message: err.message || "Failed to fetch logs by permission",
    })
  }
})

module.exports = router
