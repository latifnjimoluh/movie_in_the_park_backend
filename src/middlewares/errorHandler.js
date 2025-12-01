const logger = require("../config/logger")

const errorHandler = (err, req, res, next) => {
  logger.error("Error:", err)

  if (err.name === "ZodError") {
    return res.status(400).json({
      status: 400,
      message: "Validation error",
      errors: err.errors,
    })
  }

  if (err.status) {
    return res.status(err.status).json({
      status: err.status,
      message: err.message,
    })
  }

  res.status(500).json({
    status: 500,
    message: "Internal server error",
  })
}

module.exports = { errorHandler }
