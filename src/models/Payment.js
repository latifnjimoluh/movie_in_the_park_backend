const { DataTypes } = require("sequelize")
const { v4: uuidv4 } = require("uuid")

module.exports = (sequelize) => {
  const Payment = sequelize.define(
    "Payment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true,
      },
      reservation_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "reservations", key: "id" },
      },
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Amount in XAF",
      },
      method: {
        type: DataTypes.ENUM("momo", "cash", "orange", "card", "other"),
        allowNull: false,
      },
      proof_url: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "URL or path to payment proof file",
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
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
      tableName: "payments",
      timestamps: true,
    },
  )

  Payment.associate = (models) => {
    Payment.belongsTo(models.Reservation, { foreignKey: "reservation_id", as: "reservation" })
    Payment.belongsTo(models.User, { foreignKey: "created_by", as: "creator" })
  }

  return Payment
}
