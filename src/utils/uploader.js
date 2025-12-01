const multer = require("multer")
const path = require("path")
const fs = require("fs")

const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads")

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname))
  },
})

const fileFilter = (req, file, cb) => {
  const maxFileSize = process.env.MAX_FILE_SIZE || 52428800 // 50MB

  if (file.size > maxFileSize) {
    return cb(new Error("File too large"))
  }

  cb(null, true)
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: process.env.MAX_FILE_SIZE || 52428800,
  },
})

module.exports = upload
