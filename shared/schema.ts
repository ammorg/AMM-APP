import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users / Auth ─────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  pinHash: text("pin_hash"), // hashed 4-digit PIN for staff quick-login; null = PIN not set
  role: text("role").notNull().default("mechanic"), // "admin" | "lead_mechanic" | "mechanic"
  staffId: integer("staff_id"), // links to staff table; null for admin-only accounts
  displayName: text("display_name").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Public-safe user type (no passwordHash, no pinHash)
export type SafeUser = Omit<User, "passwordHash" | "pinHash">;

// ─── Sessions ────────────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const insertSessionSchema = createInsertSchema(sessions);
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// ─── Business Profile ────────────────────────────────────────────────────────
export const businessProfile = sqliteTable("business_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  dispatchCity: text("dispatch_city").notNull(),
  serviceTerritory: text("service_territory").notNull(),
  operatingHours: text("operating_hours").notNull(),
  notes: text("notes"),
});

export const insertBusinessProfileSchema = createInsertSchema(businessProfile).omit({ id: true });
export type InsertBusinessProfile = z.infer<typeof insertBusinessProfileSchema>;
export type BusinessProfile = typeof businessProfile.$inferSelect;

// ─── Staff ───────────────────────────────────────────────────────────────────
export const staff = sqliteTable("staff", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role").notNull(), // "Lead Mechanic" | "Mechanic" | "Dispatcher"
  phone: text("phone"),
  email: text("email"),
  availability: text("availability").notNull().default("available"), // "available" | "on_job" | "off_duty"
  onboardingStatus: text("onboarding_status").notNull().default("in_progress"), // "in_progress" | "complete"
  onboardingProgress: integer("onboarding_progress").notNull().default(0), // 0–100
  certifications: text("certifications"), // JSON array string
  hireDate: text("hire_date"),
  notes: text("notes"),
});

export const insertStaffSchema = createInsertSchema(staff).omit({ id: true });
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staff.$inferSelect;

// ─── Customers ───────────────────────────────────────────────────────────────
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  notes: text("notes"),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

// ─── Vehicles ────────────────────────────────────────────────────────────────
export const vehicles = sqliteTable("vehicles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  year: integer("year").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  vin: text("vin"),
  licensePlate: text("license_plate"),
  color: text("color"),
  mileage: integer("mileage"),
  notes: text("notes"),
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({ id: true });
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;

// ─── Jobs ────────────────────────────────────────────────────────────────────
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  vehicleId: integer("vehicle_id"),
  assignedStaffId: integer("assigned_staff_id"),
  serviceType: text("service_type").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "scheduled" | "in_progress" | "complete" | "cancelled"
  priority: text("priority").notNull().default("normal"), // "low" | "normal" | "high" | "urgent"
  scheduledAt: text("scheduled_at"),
  estimateAmount: real("estimate_amount"),
  address: text("address"), // service location address for this job
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({ id: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// ─── Invoices ────────────────────────────────────────────────────────────────
export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id"),
  customerId: integer("customer_id").notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  status: text("status").notNull().default("draft"), // "draft" | "sent" | "paid" | "overdue" | "cancelled"
  amount: real("amount").notNull(),
  taxAmount: real("tax_amount").notNull().default(0),
  totalAmount: real("total_amount").notNull(),
  issuedAt: text("issued_at").notNull(),
  dueAt: text("due_at").notNull(),
  paidAt: text("paid_at"),
  notes: text("notes"),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// ─── Job Completion Records ─────────────────────────────────────────────────
// Tracks per-job completion requirements: Form link, photos, payment
export const jobCompletions = sqliteTable("job_completions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().unique(),
  // Zoho form step
  formLink: text("form_link"),          // pasted Zoho form URL
  formCompletedAt: text("form_completed_at"),
  // Vehicle photos (JSON array of base64 data-URIs or server paths)
  vehiclePhotos: text("vehicle_photos"), // JSON string[]
  // Payment
  paymentLink: text("payment_link"),
  paymentAmountDue: real("payment_amount_due"),
  paymentStatus: text("payment_status").notNull().default("pending"), // "pending" | "sent" | "paid"
  paymentSentAt: text("payment_sent_at"),
  paymentPaidAt: text("payment_paid_at"),
  // Tech payout
  techPayoutAmount: real("tech_payout_amount"),
  techPayoutPaid: integer("tech_payout_paid").notNull().default(0), // boolean 0/1
  techPayoutPaidAt: text("tech_payout_paid_at"),
  // Timestamps
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertJobCompletionSchema = createInsertSchema(jobCompletions).omit({ id: true });
export type InsertJobCompletion = z.infer<typeof insertJobCompletionSchema>;
export type JobCompletion = typeof jobCompletions.$inferSelect;

// ─── Messaging Logs ──────────────────────────────────────────────────────────
export const messagingLogs = sqliteTable("messaging_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id"),
  customerId: integer("customer_id"),
  channel: text("channel").notNull(), // "sms" | "email"
  template: text("template").notNull(), // "estimate_ready" | "job_scheduled" | "payment_link" | "custom"
  toAddress: text("to_address").notNull(), // phone or email
  messageBody: text("message_body").notNull(),
  status: text("status").notNull().default("queued"), // "queued" | "sent" | "failed"
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull(),
});

export const insertMessagingLogSchema = createInsertSchema(messagingLogs).omit({ id: true });
export type InsertMessagingLog = z.infer<typeof insertMessagingLogSchema>;
export type MessagingLog = typeof messagingLogs.$inferSelect;

// ─── Integration Settings ────────────────────────────────────────────────────
export const integrationSettings = sqliteTable("integration_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  service: text("service").notNull().unique(), // "zoho_crm" | "zoho_books" | "zoho_mail" | "twilio"
  status: text("status").notNull().default("disconnected"), // "connected" | "disconnected" | "error"
  accountLabel: text("account_label"),  // e.g. "AMM Zoho Org"
  webhookOrNote: text("webhook_or_note"),
  syncCustomers: integer("sync_customers").notNull().default(1),  // boolean
  syncInvoices: integer("sync_invoices").notNull().default(1),
  syncJobs: integer("sync_jobs").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const insertIntegrationSettingsSchema = createInsertSchema(integrationSettings).omit({ id: true });
export type InsertIntegrationSettings = z.infer<typeof insertIntegrationSettingsSchema>;
export type IntegrationSettings = typeof integrationSettings.$inferSelect;

// ─── Payroll Settings ────────────────────────────────────────────────────────
export const payrollSettings = sqliteTable("payroll_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull().unique(),
  payoutType: text("payout_type").notNull().default("percentage"), // "percentage" | "flat_per_job"
  payoutRate: real("payout_rate").notNull().default(40), // % of job revenue, or flat $ per job
  updatedAt: text("updated_at").notNull(),
});

export const insertPayrollSettingsSchema = createInsertSchema(payrollSettings).omit({ id: true });
export type InsertPayrollSettings = z.infer<typeof insertPayrollSettingsSchema>;
export type PayrollSettings = typeof payrollSettings.$inferSelect;

// ─── Estimate Approvals ───────────────────────────────────────────────────────────
export const estimateApprovals = sqliteTable("estimate_approvals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(), // public share token
  jobId: integer("job_id"),
  customerId: integer("customer_id").notNull(),
  vehicleDescription: text("vehicle_description"), // e.g. "2018 Toyota Camry"
  services: text("services").notNull(), // JSON array of service line items
  estimateTotal: real("estimate_total").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "declined"
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull(),
});

export const insertEstimateApprovalSchema = createInsertSchema(estimateApprovals).omit({ id: true });
export type InsertEstimateApproval = z.infer<typeof insertEstimateApprovalSchema>;
export type EstimateApproval = typeof estimateApprovals.$inferSelect;
