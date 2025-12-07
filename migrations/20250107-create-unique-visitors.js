module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("UniqueVisitors", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      ipHash: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        comment: "SHA256 hash of visitor IP address for privacy",
      },
      userAgent: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      visitCount: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false,
      },
      lastVisitedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    })

    // Create index on ipHash for faster lookups
    await queryInterface.addIndex("UniqueVisitors", ["ipHash"])
    await queryInterface.addIndex("UniqueVisitors", ["lastVisitedAt"])
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("UniqueVisitors")
  },
}
