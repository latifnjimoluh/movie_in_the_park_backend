const crypto = require("crypto")
const db = require("../models")

const hashIp = (ip) => {
  return crypto
    .createHash("sha256")
    .update(ip + process.env.IP_HASH_SECRET || "secret")
    .digest("hex")
}

const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    "0.0.0.0"
  )
}

const trackVisit = async (req) => {
  try {
    const clientIp = getClientIp(req)
    const ipHash = hashIp(clientIp)

    // 1. Increment total visits
    let visitRecord = await db.Visit.findOne()
    if (!visitRecord) {
      visitRecord = await db.Visit.create({ total_visits: 1 })
    } else {
      await visitRecord.increment("total_visits", { by: 1 })
    }

    // 2. Check if visitor already exists
    const existingVisitor = await db.UniqueVisitor.findOne({ where: { ip_hash: ipHash } })

    if (existingVisitor) {
      await existingVisitor.increment("times_visited", { by: 1 })
      await existingVisitor.update({ last_visit: new Date() })

      return {
        success: true,
        isNewVisitor: false,
        totalVisits: visitRecord.total_visits,
        visitorInfo: existingVisitor,
      }
    } else {
      const newVisitor = await db.UniqueVisitor.create({
        ip_hash: ipHash,
        times_visited: 1,
        first_visit: new Date(),
        last_visit: new Date(),
      })

      return {
        success: true,
        isNewVisitor: true,
        totalVisits: visitRecord.total_visits,
        visitorInfo: newVisitor,
      }
    }
  } catch (error) {
    console.error("[TrackingService] Error tracking visit:", error)
    throw error
  }
}

module.exports = {
  trackVisit,
  getClientIp,
  hashIp,
}
