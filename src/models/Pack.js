const { DataTypes } = require("sequelize")
const { v4: uuidv4 } = require("uuid")

module.exports = (sequelize) => {
  const Pack = sequelize.define(
    "Pack",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      price: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Price in XAF cents",
      },
      description: {
        type: DataTypes.TEXT,
      },
      capacity: {
        type: DataTypes.INTEGER,
        comment: "Number of participants, null if single",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
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
      tableName: "packs",
      timestamps: true,
    },
  )

  Pack.associate = (models) => {
    Pack.hasMany(models.Reservation, { foreignKey: "pack_id", as: "reservations" })
  }

  return Pack
}
