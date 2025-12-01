require("dotenv").config()
const path = require("path")

module.exports = {
  development: {
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "Nexus2023.",
    database: process.env.DB_NAME || "movie",
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    dialect: "postgres",
    logging: false,
    seederStorage: "sequelize",
    migrationsPath: path.join(__dirname, "../migrations"),
  },
  test: {
    username: "postgres",
    password: "postgres",
    database: "movie_in_the_park_test",
    host: "localhost",
    port: 5432,
    dialect: "postgres",
    logging: false,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    logging: false,
  },
}
