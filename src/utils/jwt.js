const jwt = require("jsonwebtoken")

const generateToken = (payload, expiresIn = "7d") => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn })
}

const generateRefreshToken = (payload, expiresIn = "30d") => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn })
}

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    throw { status: 401, message: "Invalid token" }
  }
}

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET)
  } catch (err) {
    throw { status: 401, message: "Invalid refresh token" }
  }
}

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
}
