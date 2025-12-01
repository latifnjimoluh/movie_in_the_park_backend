const { DataTypes } = require("sequelize")
const { v4: uuidv4 } = require("uuid")

module.exports = (sequelize) => {
  const ActionLog = sequelize.define(
    "ActionLog",
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
      reservation_id: {
        type: DataTypes.UUID,
        references: { model: "reservations", key: "id" },
      },
      action_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      meta: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "action_logs",
      timestamps: false,
    },
  )

  ActionLog.associate = (models) => {
    ActionLog.belongsTo(models.User, { foreignKey: "user_id", as: "user" })
    ActionLog.belongsTo(models.Reservation, { foreignKey: "reservation_id", as: "reservation" })
  }

  return ActionLog
}
