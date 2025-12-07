const express = require("express")
const { trackVisit } = require("../services/trackingService")

const router = express.Router()

// POST /api/track - Track a visitor
router.post("/", async (req, res) => {
  try {
    const result = await trackVisit(req)
    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error("[TrackingRoutes] Error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

module.exports = router
