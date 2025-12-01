const { DataTypes } = require("sequelize")
const { v4: uuidv4 } = require("uuid")

module.exports = (sequelize) => {
  const Participant = sequelize.define(
    "Participant",
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
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING,
      },
      email: {
        type: DataTypes.STRING,
      },
      ticket_id: {
        type: DataTypes.UUID,
        references: { model: "tickets", key: "id" },
      },
      entrance_validated: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
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
      tableName: "participants",
      timestamps: true,
    },
  )

  Participant.associate = (models) => {
    Participant.belongsTo(models.Reservation, { foreignKey: "reservation_id", as: "reservation" })
    Participant.belongsTo(models.Ticket, { foreignKey: "ticket_id", as: "ticket" })
  }

  return Participant
}
