const ROLE_PERMISSIONS = {
  superadmin: [
    "reservations.view",
    "reservations.edit",
    "reservations.delete",
    "payments.add",
    "payments.edit",
    "payments.delete",
    "tickets.generate",
    "tickets.view",
    "scan.validate",
    "packs.manage",
    "users.manage",
    "payments.view",
  ],
  admin: [
    "reservations.view",
    "reservations.edit",
    "reservations.delete",
    "payments.add",
    "payments.edit",
    "payments.delete",
    "tickets.generate",
    "tickets.view",
    "scan.validate",
    "packs.manage",
    "users.manage",
  ],
  cashier: ["reservations.view", "reservations.edit", "payments.add", "tickets.view"],
  scanner: ["tickets.view", "scan.validate"],
}

const checkPermission = (permission) => (req, res, next) => {
  const userPermissions = ROLE_PERMISSIONS[req.user.role] || []

  if (!userPermissions.includes(permission)) {
    return res.status(403).json({
      status: 403,
      message: "Insufficient permissions",
    })
  }

  next()
}

module.exports = { checkPermission, ROLE_PERMISSIONS }
