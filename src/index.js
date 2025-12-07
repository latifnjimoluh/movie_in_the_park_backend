require("express-async-errors")
require("dotenv").config()
const { sequelize } = require("./models")
const logger = require("./config/logger")
const app = require("./app")

const PORT = process.env.PORT || 4000

sequelize
  .authenticate()
  .then(() => {
    logger.info("Database connection established")
    return sequelize.sync({ alter: false })
  })
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`)
    })
  })
  .catch((err) => {
    logger.error("Failed to start server:", err)
    process.exit(1)
  })

module.exports = app
