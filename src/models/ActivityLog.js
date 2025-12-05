const { DataTypes } = require("sequelize")
const { v4: uuidv4 } = require("uuid")

module.exports = (sequelize) => {
  const ActivityLog = sequelize.define(
    "ActivityLog",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      permission: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      entity_type: {
        type: DataTypes.ENUM("reservation", "pack", "payment", "ticket", "scan", "participant", "user"),
        allowNull: false,
      },
      entity_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      action: {
        type: DataTypes.ENUM("create", "read", "update", "delete", "export", "validate"),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      changes: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
      status: {
        type: DataTypes.ENUM("success", "failed"),
        defaultValue: "success",
      },
      ip_address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "activity_logs",
      timestamps: false,
      createdAt: "created_at",
    },
  )

  ActivityLog.associate = (models) => {
    ActivityLog.belongsTo(models.User, { foreignKey: "user_id", as: "user" })
  }

  return ActivityLog
}
