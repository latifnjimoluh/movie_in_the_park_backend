const { DataTypes } = require("sequelize")
const { v4: uuidv4 } = require("uuid")

module.exports = (sequelize) => {
  const Ticket = sequelize.define(
    "Ticket",
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
      ticket_number: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
      },
      qr_payload: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "JSON with signature",
      },
      qr_image_url: {
        type: DataTypes.STRING,
      },
      pdf_url: {
        type: DataTypes.STRING,
      },
      status: {
        type: DataTypes.ENUM("valid", "used", "cancelled"),
        defaultValue: "valid",
      },
      generated_by: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      generated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
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
      tableName: "tickets",
      timestamps: true,
    },
  )

  Ticket.associate = (models) => {
    Ticket.belongsTo(models.Reservation, { foreignKey: "reservation_id", as: "reservation" })
    Ticket.belongsTo(models.User, { foreignKey: "generated_by", as: "generator" })
    Ticket.hasMany(models.Participant, { foreignKey: "ticket_id", as: "participants" })
  }

  return Ticket
}
