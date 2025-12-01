const { ActionLog } = require("../models")
const logger = require("../config/logger")

const logService = {
  async createLog(userId, action, entity, entityId, changes = {}, status = "success") {
    try {
      await ActionLog.create({
        userId,
        action,
        entity,
        entityId,
        changes: JSON.stringify(changes),
        status,
        timestamp: new Date(),
      })
    } catch (err) {
      logger.error("Failed to create action log:", err.message)
    }
  },

  async getUserLogs(userId, limit = 50, offset = 0) {
    try {
      const logs = await ActionLog.findAndCountAll({
        where: { userId },
        limit,
        offset,
        order: [["timestamp", "DESC"]],
      })
      return logs
    } catch (err) {
      throw { status: 500, message: "Failed to fetch logs", error: err.message }
    }
  },

  async getEntityLogs(entity, entityId) {
    try {
      const logs = await ActionLog.findAll({
        where: { entity, entityId },
        order: [["timestamp", "DESC"]],
      })
      return logs
    } catch (err) {
      throw { status: 500, message: "Failed to fetch entity logs", error: err.message }
    }
  },

  async getAllLogs(limit = 100, offset = 0) {
    try {
      const logs = await ActionLog.findAndCountAll({
        limit,
        offset,
        order: [["timestamp", "DESC"]],
      })
      return logs
    } catch (err) {
      throw { status: 500, message: "Failed to fetch all logs", error: err.message }
    }
  },
}

module.exports = logService
