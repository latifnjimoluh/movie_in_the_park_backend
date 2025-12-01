const jwt = require("jsonwebtoken")
const { User } = require("../../models")
const logger = require("../../config/logger")

module.exports = {
  async refresh(req, res) {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(401).json({
        status: 401,
        message: "Refresh token required",
      })
    }

    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
      const user = await User.findByPk(decoded.id)

      if (!user) {
        return res.status(401).json({
          status: 401,
          message: "User not found",
        })
      }

      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRY || "7d",
      })

      res.json({
        status: 200,
        message: "Token refreshed",
        data: { token },
      })
    } catch (err) {
      logger.error("Token refresh failed:", err.message)
      res.status(401).json({
        status: 401,
        message: "Invalid refresh token",
      })
    }
  },
}
