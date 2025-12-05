const { ActivityLog } = require("../models")

const auditService = {
  /**
   * Enregistrer une activité d'audit
   * @param {Object} options - Options du log
   * @param {string} options.userId - ID de l'utilisateur
   * @param {string} options.permission - Permission utilisée (ex: 'packs.create')
   * @param {string} options.entityType - Type d'entité ('reservation', 'pack', etc.)
   * @param {string} options.entityId - ID de l'entité affectée
   * @param {string} options.action - Action ('create', 'update', 'delete', etc.)
   * @param {string} options.description - Description lisible
   * @param {object} options.changes - Détails des changements
   * @param {string} options.status - Statut ('success', 'failed')
   * @param {string} options.ipAddress - Adresse IP
   * @param {string} options.userAgent - User agent du navigateur
   */
  async log({
    userId,
    permission,
    entityType,
    entityId,
    action,
    description,
    changes = {},
    status = "success",
    ipAddress,
    userAgent,
  }) {
    try {
      await ActivityLog.create({
        user_id: userId,
        permission,
        entity_type: entityType,
        entity_id: entityId,
        action,
        description,
        changes,
        status,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
    } catch (err) {
      console.error("[AUDIT] Erreur lors de l'enregistrement du log:", err.message)
    }
  },

  /**
   * Récupérer les logs d'un utilisateur
   */
  async getUserLogs(userId, limit = 50, offset = 0) {
    return ActivityLog.findAndCountAll({
      where: { user_id: userId },
      include: [
        {
          model: require("../models").User,
          as: "user",
          attributes: ["id", "name", "email", "role"],
        },
      ],
      limit,
      offset,
      order: [["created_at", "DESC"]],
    })
  },

  /**
   * Récupérer les logs d'une entité
   */
  async getEntityLogs(entityType, entityId, limit = 50, offset = 0) {
    return ActivityLog.findAndCountAll({
      where: { entity_type: entityType, entity_id: entityId },
      include: [
        {
          model: require("../models").User,
          as: "user",
          attributes: ["id", "name", "email", "role"],
        },
      ],
      limit,
      offset,
      order: [["created_at", "DESC"]],
    })
  },

  /**
   * Récupérer tous les logs (pour l'audit général)
   */
  async getAllLogs(limit = 100, offset = 0, filters = {}) {
    const where = {}
    if (filters.userId) where.user_id = filters.userId
    if (filters.permission) where.permission = filters.permission
    if (filters.entityType) where.entity_type = filters.entityType
    if (filters.action) where.action = filters.action
    if (filters.status) where.status = filters.status

    return ActivityLog.findAndCountAll({
      where,
      include: [
        {
          model: require("../models").User,
          as: "user",
          attributes: ["id", "name", "email", "role"],
        },
      ],
      limit,
      offset,
      order: [["created_at", "DESC"]],
    })
  },

  /**
   * Récupérer les logs par permission
   */
  async getLogsByPermission(permission, limit = 50, offset = 0) {
    return ActivityLog.findAndCountAll({
      where: { permission },
      include: [
        {
          model: require("../models").User,
          as: "user",
          attributes: ["id", "name", "email", "role"],
        },
      ],
      limit,
      offset,
      order: [["created_at", "DESC"]],
    })
  },
}

module.exports = auditService
