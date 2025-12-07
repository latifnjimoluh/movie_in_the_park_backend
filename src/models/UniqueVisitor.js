const { DataTypes } = require("sequelize")
const crypto = require("crypto")

module.exports = (sequelize) => {
  const UniqueVisitor = sequelize.define(
    "UniqueVisitor",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      ip_hash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      times_visited: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        allowNull: false,
      },
      first_visit: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
      last_visit: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
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
      tableName: "unique_visitors",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  )

  return UniqueVisitor
}
