const ROLE_PERMISSIONS = {
  superadmin: [
    // Reservations - Full access
    "reservations.view",
    "reservations.view.all",
    "reservations.create",
    "reservations.edit",
    "reservations.edit.status",
    "reservations.delete",
    "reservations.delete.soft",
    "reservations.delete.permanent",
    "reservations.export",
    "reservations.statistics",
    "reservations.view_sensitive",

    // Payments - Full access
    "payments.view",
    "payments.view.all",
    "payments.create",
    "payments.edit",
    "payments.delete",
    "payments.export",
    "payments.approve",
    "payments.refund",
    "payments.statistics",

    // Tickets - Full access
    "tickets.view",
    "tickets.view.all",
    "tickets.create",
    "tickets.generate",
    "tickets.regenerate",
    "tickets.delete",
    "tickets.revoke",
    "tickets.validate",
    "tickets.download",
    "tickets.preview",

    // Scan/Validation - Full access
    "scan.validate",
    "scan.decode",
    "scan.search",
    "scan.statistics",

    // Packs - Full access
    "packs.view",
    "packs.view.all",
    "packs.create",
    "packs.edit",
    "packs.delete",
    "packs.activate",

    // Users - Full access
    "users.view",
    "users.view.all",
    "users.create",
    "users.edit",
    "users.edit.role",
    "users.delete",
    "users.view_sensitive",
    "users.manage_permissions",

    "audit.view.all",
    "audit.view.user",
    "audit.view.entity",
  ],

  admin: [
    // Reservations - Read & basic management
    "reservations.view",
    "reservations.view.all",
    "reservations.create",
    "reservations.edit",
    "reservations.edit.status",
    "reservations.delete",
    "reservations.delete.soft",
    "reservations.export",
    "reservations.statistics",

    // Payments - Read & basic management
    "payments.view",
    "payments.view.all",
    "payments.create",
    "payments.edit",
    "payments.delete",
    "payments.export",
    "payments.approve",
    "payments.statistics",

    // Tickets - Full management
    "tickets.view",
    "tickets.view.all",
    "tickets.generate",
    "tickets.regenerate",
    "tickets.download",
    "tickets.preview",

    // Scan/Validation - Full access
    "scan.validate",
    "scan.decode",
    "scan.search",
    "scan.statistics",

    // Packs - Full management
    "packs.view",
    "packs.view.all",
    "packs.create",
    "packs.edit",
    "packs.delete",
    "packs.activate",

    // Users - Read & basic management
    "users.view",
    "users.view.all",
    "users.create",
    "users.edit",

    "audit.view.entity",
  ],

  cashier: [
    // Reservations - Create and view own
    "reservations.view",
    "reservations.create",
    "reservations.edit",

    // Payments - Create and view
    "payments.view",
    "payments.create",

    // Tickets - View only
    "tickets.view",
    "tickets.download",
    "tickets.preview",

    // Packs - View only
    "packs.view",

    // User - View own profile
    "users.view.self",
  ],

  scanner: [
    // Tickets - View only
    "tickets.view",

    // Scan/Validation - Core scanning functions
    "scan.validate",
    "scan.decode",
    "scan.search",

    // User - View own profile
    "users.view.self",
  ],

  operator: [
    // Reservations - View and limited edit
    "reservations.view",
    "reservations.view.all",
    "reservations.create",

    // Tickets - View and generate
    "tickets.view",
    "tickets.view.all",
    "tickets.generate",
    "tickets.download",

    // Payments - View only
    "payments.view",

    // Packs - View only
    "packs.view",
    "packs.view.all",

    // Scan - Statistics
    "scan.statistics",

    // User - View own profile
    "users.view.self",
  ],
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
