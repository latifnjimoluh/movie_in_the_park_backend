const multer = require("multer")
const path = require("path")
const fs = require("fs")

const uploadDir = path.join(__dirname, "..", "uploads", "payments")

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const name = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext
    cb(null, name)
  },
})

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"]

  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Invalid file type"), false)
  }

  cb(null, true)
}

module.exports = multer({ storage, fileFilter })
