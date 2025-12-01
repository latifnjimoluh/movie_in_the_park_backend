const { DataTypes } = require("sequelize")
const { v4: uuidv4 } = require("uuid")

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: { isEmail: true },
      },
      password_hash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING,
      },
      role: {
        type: DataTypes.ENUM("superadmin", "admin", "cashier", "scanner"),
        defaultValue: "cashier",
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "users",
      timestamps: true,
    },
  )

  User.associate = (models) => {
    User.hasMany(models.Payment, { foreignKey: "created_by", as: "payments" })
    User.hasMany(models.Ticket, { foreignKey: "generated_by", as: "tickets" })
    User.hasMany(models.ActionLog, { foreignKey: "user_id", as: "actions" })
  }

  return User
}
