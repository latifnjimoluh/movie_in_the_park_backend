module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("activity_logs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      permission: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Permission utilisée pour cette action (ex: packs.create)",
      },
      entity_type: {
        type: Sequelize.ENUM("reservation", "pack", "payment", "ticket", "scan", "participant", "user"),
        allowNull: false,
        comment: "Type d'entité affectée",
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID de l'entité affectée",
      },
      action: {
        type: Sequelize.ENUM("create", "read", "update", "delete", "export", "validate"),
        allowNull: false,
        comment: "Type d'action effectuée",
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Description lisible de l'action",
      },
      changes: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: "Détails des changements effectués",
      },
      status: {
        type: Sequelize.ENUM("success", "failed"),
        defaultValue: "success",
      },
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        allowNull: false,
      },
    })

    await queryInterface.addIndex("activity_logs", ["user_id"])
    await queryInterface.addIndex("activity_logs", ["entity_type", "entity_id"])
    await queryInterface.addIndex("activity_logs", ["permission"])
    await queryInterface.addIndex("activity_logs", ["created_at"])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("activity_logs")
  },
}
