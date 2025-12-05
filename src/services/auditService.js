const { ActivityLog, User } = require("../models")
const logger = require("../config/logger")

const auditService = {
  /**
   * Enregistrer une activité d'audit
   */
  async log({
    userId,
    permission = null,
    entityType,
    entityId = null,
    action,
    description = "",
    changes = {},
    status = "success",
    ipAddress = null,
    userAgent = null,
  }) {
    try {
      /* ============================================================
         🔍 VALIDATIONS
      ============================================================= */
      if (!userId) {
        logger.error("[AUDIT] userId manquant dans le log d'audit")
        return null
      }

      if (!entityType) {
        logger.error("[AUDIT] entityType manquant dans le log d'audit")
        return null
      }

      if (!action) {
        logger.error("[AUDIT] action manquant dans le log d'audit")
        return null
      }

      /* ============================================================
         📝 LOG AVANT INSERTION
      ============================================================= */
      console.log("[AUDIT] ➤ Création log :", {
        user_id: userId,
        permission,
        entity_type: entityType,
        entity_id: entityId,
        action,
        status,
      })

      /* ============================================================
         🗂️ INSERTION DANS LA BD
      ============================================================= */
      const activityLog = await ActivityLog.create({
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

      /* ============================================================
         ✔️ SUCCÈS
      ============================================================= */
      console.log("[AUDIT] ✔ Log enregistré :", activityLog.id)

      logger.info(`[AUDIT] Log créé: ${activityLog.id}`)

      return activityLog
    } catch (err) {
      /* ============================================================
         ❌ ERREUR
      ============================================================= */
      console.error("[AUDIT] ❌ Erreur lors de l'enregistrement du log")
      console.error("Message :", err.message)
      console.error("Stack :", err.stack)
      console.error("Payload envoyé :", {
        userId,
        permission,
        entityType,
        entityId,
        action,
        status,
      })

      logger.error("[AUDIT] Erreur lors de l'enregistrement du log", {
        error: err.message,
        stack: err.stack,
        data: {
          userId,
          permission,
          entityType,
          entityId,
          action,
          status,
        },
      })

      return null
    }
  },

  /* ============================================================
     🔎 Récupérer les logs d'un utilisateur
  ============================================================= */
  async getUserLogs(userId, limit = 50, offset = 0) {
    return ActivityLog.findAndCountAll({
      where: { user_id: userId },
      include: [{ model: User, as: "user", attributes: ["id", "name", "email", "role"] }],
      limit,
      offset,
      order: [["created_at", "DESC"]],
    })
  },

  /* ============================================================
     🔎 Récupérer les logs d'une entité
  ============================================================= */
  async getEntityLogs(entityType, entityId, limit = 50, offset = 0) {
    return ActivityLog.findAndCountAll({
      where: { entity_type: entityType, entity_id: entityId },
      include: [{ model: User, as: "user", attributes: ["id", "name", "email", "role"] }],
      limit,
      offset,
      order: [["created_at", "DESC"]],
    })
  },

  /* ============================================================
     🔎 Récupérer tous les logs
  ============================================================= */
  async getAllLogs(limit = 100, offset = 0, filters = {}) {
    const where = {}

    if (filters.userId) where.user_id = filters.userId
    if (filters.permission) where.permission = filters.permission
    if (filters.entityType) where.entity_type = filters.entityType
    if (filters.action) where.action = filters.action
    if (filters.status) where.status = filters.status

    return ActivityLog.findAndCountAll({
      where,
      include: [{ model: User, as: "user", attributes: ["id", "name", "email", "role"] }],
      limit,
      offset,
      order: [["created_at", "DESC"]],
    })
  },

  /* ============================================================
     🔎 Logs filtrés par permission
  ============================================================= */
  async getLogsByPermission(permission, limit = 50, offset = 0) {
    return ActivityLog.findAndCountAll({
      where: { permission },
      include: [{ model: User, as: "user", attributes: ["id", "name", "email", "role"] }],
      limit,
      offset,
      order: [["created_at", "DESC"]],
    })
  },
}

module.exports = auditService
