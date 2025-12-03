const { z } = require("zod")

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  remember: z.boolean().optional(),
})

const createReservationSchema = z.object({
  payeur_name: z.string().min(2, "Name required"),
  payeur_phone: z.string().min(9, "Invalid phone"),

  // email facultatif, vide ou valide
  payeur_email: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal(""))
    .nullable(),

  pack_id: z.string().uuid("Invalid pack ID"),

  quantity: z.number().min(1, "Quantity must be at least 1"),

  participants: z
    .array(
      z.object({
        name: z.string().min(2, "Participant name required"),

        // téléphone facultatif
        phone: z.string().optional().nullable().or(z.literal("")),

        // email facultatif, vide ou valide
        email: z
          .string()
          .email("Invalid email")
          .optional()
          .or(z.literal(""))
          .nullable(),
      })
    )
    .optional()
})

const addPaymentSchema = z.object({
  amount: z.number().min(1, "Amount must be positive"),
  method: z.enum(["momo", "cash", "card", "other"]),
  comment: z.string().optional(),
})

const createUserSchema = z.object({
  name: z.string().min(2, "Name required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["superadmin", "admin", "cashier", "scanner"]),
  phone: z.string().optional(),
})

const validate = (schema) => (req, res, next) => {
  try {
    const validated = schema.parse(req.body)
    req.validatedData = validated
    next()
  } catch (err) {
    res.status(400).json({
      status: 400,
      message: "Validation error",
      errors: err.errors,
    })
  }
}

module.exports = {
  validate,
  loginSchema,
  createReservationSchema,
  addPaymentSchema,
  createUserSchema,
}
