const express = require("express")
const { trackVisit } = require("../services/trackingService")
const trackingController = require("../controllers/tracking/trackingController")
const { verifyToken } = require("../middlewares/auth")

const router = express.Router()

// POST /api/track - Track a visitor (no auth required)
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

router.get("/stats", verifyToken, trackingController.getStats)

router.get("/evolution", verifyToken, trackingController.getDailyEvolution)

module.exports = router
