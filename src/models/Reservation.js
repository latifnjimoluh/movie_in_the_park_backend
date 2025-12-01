const { DataTypes } = require("sequelize")
const { v4: uuidv4 } = require("uuid")

module.exports = (sequelize) => {
  const Reservation = sequelize.define(
    "Reservation",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true,
      },
      payeur_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      payeur_phone: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      payeur_email: {
        type: DataTypes.STRING,
        validate: { isEmail: true },
      },
      pack_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "packs", key: "id" },
      },
      pack_name_snapshot: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      unit_price: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Price per unit in XAF cents",
      },
      quantity: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        allowNull: false,
      },
      total_price: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      total_paid: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      remaining_amount: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.total_price - this.total_paid
        },
      },
      status: {
        type: DataTypes.ENUM("pending", "partial", "paid", "ticket_generated", "cancelled"),
        defaultValue: "pending",
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
      tableName: "reservations",
      timestamps: true,
    },
  )

  Reservation.associate = (models) => {
    Reservation.belongsTo(models.Pack, { foreignKey: "pack_id", as: "pack" })
    Reservation.hasMany(models.Participant, { foreignKey: "reservation_id", as: "participants" })
    Reservation.hasMany(models.Payment, { foreignKey: "reservation_id", as: "payments" })
    Reservation.hasMany(models.Ticket, { foreignKey: "reservation_id", as: "tickets" })
    Reservation.hasMany(models.ActionLog, { foreignKey: "reservation_id", as: "actions" })
  }

  return Reservation
}
