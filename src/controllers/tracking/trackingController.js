const { Visit, UniqueVisitor, DailyVisits } = require("../../models")
const { Op } = require("sequelize")

module.exports = {
  async getStats(req, res) {
    try {
      const visitRecord = await Visit.findOne()
      const totalVisits = visitRecord?.total_visits || 0

      const uniqueVisitorsCount = await UniqueVisitor.count()

      const averageVisitsPerUser = uniqueVisitorsCount > 0 ? (totalVisits / uniqueVisitorsCount).toFixed(2) : 0

      res.json({
        status: 200,
        message: "Tracking statistics",
        data: {
          total_visits: totalVisits,
          unique_visitors: uniqueVisitorsCount,
          average_visits_per_user: Number.parseFloat(averageVisitsPerUser),
        },
      })
    } catch (error) {
      console.error("[TrackingController] Error:", error)
      res.status(500).json({
        status: 500,
        message: "Failed to fetch tracking statistics",
        error: error.message,
      })
    }
  },

  async getDailyEvolution(req, res) {
    try {
      const days = Number.parseInt(req.query.days) || 30

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      const startDateString = startDate.toISOString().split("T")[0]

      const dailyVisits = await DailyVisits.findAll({
        where: {
          visit_date: {
            [Op.gte]: startDateString,
          },
        },
        order: [["visit_date", "ASC"]],
      })

      // Format data for chart consumption
      const formattedData = dailyVisits.map((record) => ({
        date: record.visit_date,
        total_visits: record.total_visits,
        unique_visitors: record.unique_visitors,
      }))

      res.json({
        status: 200,
        message: "Daily evolution data",
        data: {
          period_days: days,
          data: formattedData,
        },
      })
    } catch (error) {
      console.error("[TrackingController] Error fetching daily evolution:", error)
      res.status(500).json({
        status: 500,
        message: "Failed to fetch daily evolution data",
        error: error.message,
      })
    }
  },
}
