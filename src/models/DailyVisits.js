const { DataTypes } = require("sequelize")

module.exports = (sequelize) => {
  const DailyVisits = sequelize.define(
    "DailyVisits",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      visit_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        unique: true,
      },
      total_visits: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      unique_visitors: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "daily_visits",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  )

  return DailyVisits
}
