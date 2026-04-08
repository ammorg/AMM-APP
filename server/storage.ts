import {
  businessProfile, staff, customers, vehicles, jobs, invoices, users, sessions,
  estimateApprovals, jobCompletions, messagingLogs, integrationSettings, payrollSettings,
  type BusinessProfile, type InsertBusinessProfile,
  type Staff, type InsertStaff,
  type Customer, type InsertCustomer,
  type Vehicle, type InsertVehicle,
  type Job, type InsertJob,
  type Invoice, type InsertInvoice,
  type User, type InsertUser, type SafeUser,
  type Session, type InsertSession,
  type EstimateApproval, type InsertEstimateApproval,
  type JobCompletion, type InsertJobCompletion,
  type MessagingLog, type InsertMessagingLog,
  type IntegrationSettings, type InsertIntegrationSettings,
  type PayrollSettings, type InsertPayrollSettings,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, inArray } from "drizzle-orm";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// Support an explicit path for the SQLite database file.
// When DATABASE_PATH is set (e.g. on Render with a persistent disk mounted at
// /var/data), the database is written there.  Falls back to "data.db" in the
// current working directory so local development requires no configuration.
const dbPath = process.env.DATABASE_PATH ?? "data.db";

// Ensure the parent directory exists before opening the database.  This is a
// no-op for the default "data.db" case (cwd always exists) but is required when
// DATABASE_PATH points to a sub-directory that may not yet exist on a fresh
// Render disk mount.
const dbDir = path.dirname(dbPath);
if (dbDir !== "." && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Runtime migrations — add new columns if they don't exist yet
try { sqlite.exec("ALTER TABLE users ADD COLUMN pin_hash TEXT"); } catch { /* column already exists */ }
try { sqlite.exec("ALTER TABLE jobs ADD COLUMN address TEXT"); } catch { /* column already exists */ }

// Phase 4 new tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS job_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL UNIQUE,
    form_link TEXT,
    form_completed_at TEXT,
    vehicle_photos TEXT,
    payment_link TEXT,
    payment_amount_due REAL,
    payment_status TEXT NOT NULL DEFAULT 'pending',
    payment_sent_at TEXT,
    payment_paid_at TEXT,
    tech_payout_amount REAL,
    tech_payout_paid INTEGER NOT NULL DEFAULT 0,
    tech_payout_paid_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messaging_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    customer_id INTEGER,
    channel TEXT NOT NULL,
    template TEXT NOT NULL,
    to_address TEXT NOT NULL,
    message_body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    sent_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS integration_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'disconnected',
    account_label TEXT,
    webhook_or_note TEXT,
    sync_customers INTEGER NOT NULL DEFAULT 1,
    sync_invoices INTEGER NOT NULL DEFAULT 1,
    sync_jobs INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payroll_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL UNIQUE,
    payout_type TEXT NOT NULL DEFAULT 'percentage',
    payout_rate REAL NOT NULL DEFAULT 40,
    updated_at TEXT NOT NULL
  );
`);

// Seed default integration service rows
const integrationServices = ["zoho_crm", "zoho_books", "zoho_mail", "twilio"];
for (const svc of integrationServices) {
  try {
    sqlite.prepare(
      `INSERT OR IGNORE INTO integration_settings (service, status, updated_at) VALUES (?, 'disconnected', ?)`
    ).run(svc, new Date().toISOString());
  } catch { /* ignore */ }
}

// Seed PINs for any existing staff users that don't have one yet
// (runs once on startup against existing data.db)
function migrateExistingPins() {
  function hp(pin: string) {
    return require("crypto").createHash("sha256").update("amm_pin_2026:" + pin).digest("hex");
  }
  const demoPins: Record<string, string> = { devon: "1492", janelle: "2837", remy: "5501" };
  for (const [username, pin] of Object.entries(demoPins)) {
    try {
      sqlite.prepare("UPDATE users SET pin_hash = ? WHERE username = ? AND pin_hash IS NULL")
        .run(hp(pin), username);
    } catch { /* ignore */ }
  }
}
migrateExistingPins();

// Simple password hashing using Node crypto (no bcrypt needed)
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update("amm_salt_2026:" + password).digest("hex");
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update("amm_pin_2026:" + pin).digest("hex");
}

function verifyPin(pin: string, hash: string): boolean {
  return hashPin(pin) === hash;
}

// Ensure tables exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    pin_hash TEXT,
    role TEXT NOT NULL DEFAULT 'mechanic',
    staff_id INTEGER,
    display_name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS business_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    dispatch_city TEXT NOT NULL,
    service_territory TEXT NOT NULL,
    operating_hours TEXT NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    availability TEXT NOT NULL DEFAULT 'available',
    onboarding_status TEXT NOT NULL DEFAULT 'in_progress',
    onboarding_progress INTEGER NOT NULL DEFAULT 0,
    certifications TEXT,
    hire_date TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    city TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    vin TEXT,
    license_plate TEXT,
    color TEXT,
    mileage INTEGER,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    vehicle_id INTEGER,
    assigned_staff_id INTEGER,
    service_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'normal',
    scheduled_at TEXT,
    estimate_amount REAL,
    address TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS estimate_approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    job_id INTEGER,
    customer_id INTEGER NOT NULL,
    vehicle_description TEXT,
    services TEXT NOT NULL,
    estimate_total REAL NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approved_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    customer_id INTEGER NOT NULL,
    invoice_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    amount REAL NOT NULL,
    tax_amount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL,
    issued_at TEXT NOT NULL,
    due_at TEXT NOT NULL,
    paid_at TEXT,
    notes TEXT
  );
`);

export interface IStorage {
  // Auth
  getUserByUsername(username: string): User | undefined;
  getUserById(id: number): User | undefined;
  createUser(data: InsertUser): User;
  verifyCredentials(username: string, password: string): SafeUser | null;
  toSafeUser(user: User): SafeUser;

  // Sessions
  createSession(userId: number): Session;
  getSession(sessionId: string): Session | undefined;
  deleteSession(sessionId: string): void;
  cleanExpiredSessions(): void;

  // Business Profile
  getBusinessProfile(): BusinessProfile | undefined;
  upsertBusinessProfile(data: InsertBusinessProfile): BusinessProfile;

  // Staff
  getAllStaff(): Staff[];
  getStaffById(id: number): Staff | undefined;
  createStaff(data: InsertStaff): Staff;
  updateStaff(id: number, data: Partial<InsertStaff>): Staff | undefined;
  deleteStaff(id: number): void;

  // Customers
  getAllCustomers(): Customer[];
  getCustomersByStaffId(staffId: number): Customer[];
  getCustomerById(id: number): Customer | undefined;
  createCustomer(data: InsertCustomer): Customer;
  updateCustomer(id: number, data: Partial<InsertCustomer>): Customer | undefined;

  // Vehicles
  getVehiclesByCustomer(customerId: number): Vehicle[];
  getAllVehicles(): Vehicle[];
  createVehicle(data: InsertVehicle): Vehicle;
  updateVehicle(id: number, data: Partial<InsertVehicle>): Vehicle | undefined;

  // Jobs
  getAllJobs(): Job[];
  getJobsByStaffId(staffId: number): Job[];
  getJobById(id: number): Job | undefined;
  createJob(data: InsertJob): Job;
  updateJob(id: number, data: Partial<InsertJob>): Job | undefined;

  // Invoices
  getAllInvoices(): Invoice[];
  getInvoicesByCustomerIds(customerIds: number[]): Invoice[];
  getInvoiceById(id: number): Invoice | undefined;
  createInvoice(data: InsertInvoice): Invoice;
  updateInvoice(id: number, data: Partial<InsertInvoice>): Invoice | undefined;

  // PIN login
  verifyPinLogin(pin: string): SafeUser | null;
  setUserPin(userId: number, pin: string): void;

  // Estimate Approvals
  createEstimateApproval(data: InsertEstimateApproval): EstimateApproval;
  getEstimateApprovalByToken(token: string): EstimateApproval | undefined;
  getEstimateApprovalsByCustomer(customerId: number): EstimateApproval[];
  getAllEstimateApprovals(): EstimateApproval[];
  updateEstimateApproval(id: number, data: Partial<InsertEstimateApproval>): EstimateApproval | undefined;

  // Job Completions
  getJobCompletion(jobId: number): JobCompletion | undefined;
  upsertJobCompletion(jobId: number, data: Partial<InsertJobCompletion>): JobCompletion;
  getAllJobCompletions(): JobCompletion[];

  // Messaging Logs
  createMessagingLog(data: InsertMessagingLog): MessagingLog;
  getAllMessagingLogs(): MessagingLog[];
  getMessagingLogsByJob(jobId: number): MessagingLog[];
  updateMessagingLog(id: number, data: Partial<InsertMessagingLog>): MessagingLog | undefined;

  // Integration Settings
  getAllIntegrationSettings(): IntegrationSettings[];
  getIntegrationSetting(service: string): IntegrationSettings | undefined;
  upsertIntegrationSetting(service: string, data: Partial<InsertIntegrationSettings>): IntegrationSettings;

  // Payroll Settings
  getAllPayrollSettings(): PayrollSettings[];
  getPayrollSettingByStaff(staffId: number): PayrollSettings | undefined;
  upsertPayrollSetting(staffId: number, data: Partial<InsertPayrollSettings>): PayrollSettings;

  // Seed
  isSeeded(): boolean;
  seed(): void;
}

export class DatabaseStorage implements IStorage {
  // ── Auth ──────────────────────────────────────────────────────────────────
  getUserByUsername(username: string): User | undefined {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  getUserById(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  createUser(data: InsertUser): User {
    return db.insert(users).values(data).returning().get();
  }



  verifyCredentials(username: string, password: string): SafeUser | null {
    const user = this.getUserByUsername(username);
    if (!user) return null;
    if (!verifyPassword(password, user.passwordHash)) return null;
    return this.toSafeUser(user);
  }

  toSafeUser(user: User): SafeUser {
    const { passwordHash: _ph, pinHash: _pin, ...safe } = user;
    return safe;
  }

  verifyPinLogin(pin: string): SafeUser | null {
    const allUsers = db.select().from(users).all();
    for (const user of allUsers) {
      if (user.pinHash && verifyPin(pin, user.pinHash)) {
        return this.toSafeUser(user);
      }
    }
    return null;
  }

  setUserPin(userId: number, pin: string): void {
    db.update(users).set({ pinHash: hashPin(pin) }).where(eq(users.id, userId)).run();
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  createSession(userId: number): Session {
    const id = crypto.randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const session: InsertSession = {
      id,
      userId,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };
    return db.insert(sessions).values(session).returning().get();
  }

  getSession(sessionId: string): Session | undefined {
    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!session) return undefined;
    if (new Date(session.expiresAt) < new Date()) {
      this.deleteSession(sessionId);
      return undefined;
    }
    return session;
  }

  deleteSession(sessionId: string): void {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  }

  cleanExpiredSessions(): void {
    const now = new Date().toISOString();
    db.delete(sessions).where(eq(sessions.expiresAt, now)).run();
  }

  // ── Business Profile ──────────────────────────────────────────────────────
  getBusinessProfile(): BusinessProfile | undefined {
    return db.select().from(businessProfile).limit(1).get();
  }

  upsertBusinessProfile(data: InsertBusinessProfile): BusinessProfile {
    const existing = this.getBusinessProfile();
    if (existing) {
      db.update(businessProfile).set(data).where(eq(businessProfile.id, existing.id)).run();
      return db.select().from(businessProfile).where(eq(businessProfile.id, existing.id)).get()!;
    }
    return db.insert(businessProfile).values(data).returning().get();
  }

  // ── Staff ─────────────────────────────────────────────────────────────────
  getAllStaff(): Staff[] {
    return db.select().from(staff).all();
  }

  getStaffById(id: number): Staff | undefined {
    return db.select().from(staff).where(eq(staff.id, id)).get();
  }

  createStaff(data: InsertStaff): Staff {
    return db.insert(staff).values(data).returning().get();
  }

  updateStaff(id: number, data: Partial<InsertStaff>): Staff | undefined {
    db.update(staff).set(data).where(eq(staff.id, id)).run();
    return db.select().from(staff).where(eq(staff.id, id)).get();
  }

  deleteStaff(id: number): void {
    db.delete(staff).where(eq(staff.id, id)).run();
  }

  // ── Customers ─────────────────────────────────────────────────────────────
  getAllCustomers(): Customer[] {
    return db.select().from(customers).all();
  }

  getCustomersByStaffId(staffId: number): Customer[] {
    // Get all customer IDs from jobs assigned to this staff member
    const staffJobs = db.select().from(jobs).where(eq(jobs.assignedStaffId, staffId)).all();
    const customerIds = Array.from(new Set(staffJobs.map(j => j.customerId)));
    if (customerIds.length === 0) return [];
    return db.select().from(customers).where(inArray(customers.id, customerIds)).all();
  }

  getCustomerById(id: number): Customer | undefined {
    return db.select().from(customers).where(eq(customers.id, id)).get();
  }

  createCustomer(data: InsertCustomer): Customer {
    return db.insert(customers).values(data).returning().get();
  }

  updateCustomer(id: number, data: Partial<InsertCustomer>): Customer | undefined {
    db.update(customers).set(data).where(eq(customers.id, id)).run();
    return db.select().from(customers).where(eq(customers.id, id)).get();
  }

  // ── Vehicles ──────────────────────────────────────────────────────────────
  getVehiclesByCustomer(customerId: number): Vehicle[] {
    return db.select().from(vehicles).where(eq(vehicles.customerId, customerId)).all();
  }

  getAllVehicles(): Vehicle[] {
    return db.select().from(vehicles).all();
  }

  createVehicle(data: InsertVehicle): Vehicle {
    return db.insert(vehicles).values(data).returning().get();
  }

  updateVehicle(id: number, data: Partial<InsertVehicle>): Vehicle | undefined {
    db.update(vehicles).set(data).where(eq(vehicles.id, id)).run();
    return db.select().from(vehicles).where(eq(vehicles.id, id)).get();
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────
  getAllJobs(): Job[] {
    return db.select().from(jobs).orderBy(desc(jobs.id)).all();
  }

  getJobsByStaffId(staffId: number): Job[] {
    return db.select().from(jobs).where(eq(jobs.assignedStaffId, staffId)).orderBy(desc(jobs.id)).all();
  }

  getJobById(id: number): Job | undefined {
    return db.select().from(jobs).where(eq(jobs.id, id)).get();
  }

  createJob(data: InsertJob): Job {
    return db.insert(jobs).values(data).returning().get();
  }

  updateJob(id: number, data: Partial<InsertJob>): Job | undefined {
    db.update(jobs).set(data).where(eq(jobs.id, id)).run();
    return db.select().from(jobs).where(eq(jobs.id, id)).get();
  }

  // ── Invoices ──────────────────────────────────────────────────────────────
  getAllInvoices(): Invoice[] {
    return db.select().from(invoices).orderBy(desc(invoices.id)).all();
  }

  getInvoicesByCustomerIds(customerIds: number[]): Invoice[] {
    if (customerIds.length === 0) return [];
    return db.select().from(invoices).where(inArray(invoices.customerId, customerIds)).orderBy(desc(invoices.id)).all();
  }

  getInvoiceById(id: number): Invoice | undefined {
    return db.select().from(invoices).where(eq(invoices.id, id)).get();
  }

  createInvoice(data: InsertInvoice): Invoice {
    return db.insert(invoices).values(data).returning().get();
  }

  updateInvoice(id: number, data: Partial<InsertInvoice>): Invoice | undefined {
    db.update(invoices).set(data).where(eq(invoices.id, id)).run();
    return db.select().from(invoices).where(eq(invoices.id, id)).get();
  }

  // ── Estimate Approvals ─────────────────────────────────────────────
  createEstimateApproval(data: InsertEstimateApproval): EstimateApproval {
    return db.insert(estimateApprovals).values(data).returning().get();
  }

  getEstimateApprovalByToken(token: string): EstimateApproval | undefined {
    return db.select().from(estimateApprovals).where(eq(estimateApprovals.token, token)).get();
  }

  getEstimateApprovalsByCustomer(customerId: number): EstimateApproval[] {
    return db.select().from(estimateApprovals).where(eq(estimateApprovals.customerId, customerId)).all();
  }

  getAllEstimateApprovals(): EstimateApproval[] {
    return db.select().from(estimateApprovals).orderBy(desc(estimateApprovals.id)).all();
  }

  updateEstimateApproval(id: number, data: Partial<InsertEstimateApproval>): EstimateApproval | undefined {
    db.update(estimateApprovals).set(data).where(eq(estimateApprovals.id, id)).run();
    return db.select().from(estimateApprovals).where(eq(estimateApprovals.id, id)).get();
  }

  // ── Seed ──────────────────────────────────────────────────────────────────
  // ── Job Completions ──────────────────────────────────────────────────────
  getJobCompletion(jobId: number): JobCompletion | undefined {
    return db.select().from(jobCompletions).where(eq(jobCompletions.jobId, jobId)).get();
  }

  upsertJobCompletion(jobId: number, data: Partial<InsertJobCompletion>): JobCompletion {
    const now = new Date().toISOString();
    const existing = this.getJobCompletion(jobId);
    if (existing) {
      db.update(jobCompletions)
        .set({ ...data, updatedAt: now })
        .where(eq(jobCompletions.jobId, jobId))
        .run();
      return db.select().from(jobCompletions).where(eq(jobCompletions.jobId, jobId)).get()!;
    }
    return db.insert(jobCompletions).values({
      jobId,
      createdAt: now,
      updatedAt: now,
      paymentStatus: "pending",
      techPayoutPaid: 0,
      ...data,
    } as InsertJobCompletion).returning().get();
  }

  getAllJobCompletions(): JobCompletion[] {
    return db.select().from(jobCompletions).orderBy(desc(jobCompletions.id)).all();
  }

  // ── Messaging Logs ────────────────────────────────────────────────────────
  createMessagingLog(data: InsertMessagingLog): MessagingLog {
    return db.insert(messagingLogs).values(data).returning().get();
  }

  getAllMessagingLogs(): MessagingLog[] {
    return db.select().from(messagingLogs).orderBy(desc(messagingLogs.id)).all();
  }

  getMessagingLogsByJob(jobId: number): MessagingLog[] {
    return db.select().from(messagingLogs).where(eq(messagingLogs.jobId, jobId)).orderBy(desc(messagingLogs.id)).all();
  }

  updateMessagingLog(id: number, data: Partial<InsertMessagingLog>): MessagingLog | undefined {
    db.update(messagingLogs).set(data).where(eq(messagingLogs.id, id)).run();
    return db.select().from(messagingLogs).where(eq(messagingLogs.id, id)).get();
  }

  // ── Integration Settings ──────────────────────────────────────────────────
  getAllIntegrationSettings(): IntegrationSettings[] {
    return db.select().from(integrationSettings).all();
  }

  getIntegrationSetting(service: string): IntegrationSettings | undefined {
    return db.select().from(integrationSettings).where(eq(integrationSettings.service, service)).get();
  }

  upsertIntegrationSetting(service: string, data: Partial<InsertIntegrationSettings>): IntegrationSettings {
    const now = new Date().toISOString();
    const existing = this.getIntegrationSetting(service);
    if (existing) {
      db.update(integrationSettings)
        .set({ ...data, updatedAt: now })
        .where(eq(integrationSettings.service, service))
        .run();
      return db.select().from(integrationSettings).where(eq(integrationSettings.service, service)).get()!;
    }
    return db.insert(integrationSettings).values({
      service, updatedAt: now, syncCustomers: 1, syncInvoices: 1, syncJobs: 1, status: "disconnected", ...data,
    } as InsertIntegrationSettings).returning().get();
  }

  // ── Payroll Settings ──────────────────────────────────────────────────────
  getAllPayrollSettings(): PayrollSettings[] {
    return db.select().from(payrollSettings).all();
  }

  getPayrollSettingByStaff(staffId: number): PayrollSettings | undefined {
    return db.select().from(payrollSettings).where(eq(payrollSettings.staffId, staffId)).get();
  }

  upsertPayrollSetting(staffId: number, data: Partial<InsertPayrollSettings>): PayrollSettings {
    const now = new Date().toISOString();
    const existing = this.getPayrollSettingByStaff(staffId);
    if (existing) {
      db.update(payrollSettings)
        .set({ ...data, updatedAt: now })
        .where(eq(payrollSettings.staffId, staffId))
        .run();
      return db.select().from(payrollSettings).where(eq(payrollSettings.staffId, staffId)).get()!;
    }
    return db.insert(payrollSettings).values({
      staffId, updatedAt: now, payoutType: "percentage", payoutRate: 40, ...data,
    } as InsertPayrollSettings).returning().get();
  }

    isSeeded(): boolean {
    const count = db.select().from(staff).all().length;
    return count > 0;
  }

  seed(): void {
    if (this.isSeeded()) return;

    // Business profile
    this.upsertBusinessProfile({
      name: "Affordable Mobile Mechanics",
      ownerName: "Marcus Webb",
      phone: "(337) 555-0192",
      email: "dispatch@affordablemobilemechanics.com",
      dispatchCity: "Los Angeles, CA",
      serviceTerritory: "Lafayette, Louisiana — 30 mile radius",
      operatingHours: "Mon–Fri 7am–6pm, Sat 8am–3pm",
      notes: "Remote dispatch from LA. All techs based in Lafayette area.",
    });

    // Staff
    const s1 = this.createStaff({
      name: "Devon Thibodaux",
      role: "Lead Mechanic",
      phone: "(337) 555-0201",
      email: "devon@affordablemobilemechanics.com",
      availability: "available",
      onboardingStatus: "complete",
      onboardingProgress: 100,
      certifications: JSON.stringify(["ASE Master Tech", "AC Certified", "Diesel"]),
      hireDate: "2023-03-15",
      notes: "Lead tech, handles complex diagnostics.",
    });

    const s2 = this.createStaff({
      name: "Janelle Broussard",
      role: "Mechanic",
      phone: "(337) 555-0334",
      email: "janelle@affordablemobilemechanics.com",
      availability: "on_job",
      onboardingStatus: "complete",
      onboardingProgress: 100,
      certifications: JSON.stringify(["ASE Certified", "Brakes & Suspension"]),
      hireDate: "2024-01-08",
      notes: "Specializes in brakes, suspension, tires.",
    });

    const s3 = this.createStaff({
      name: "Remy Fontenot",
      role: "Mechanic",
      phone: "(337) 555-0478",
      email: "remy@affordablemobilemechanics.com",
      availability: "available",
      onboardingStatus: "in_progress",
      onboardingProgress: 60,
      certifications: JSON.stringify(["ASE Student"]),
      hireDate: "2025-11-01",
      notes: "New hire — completing certification track.",
    });

    // Demo user accounts — passwords hashed with hashPassword()
    // admin / admin1234 (no PIN)
    this.createUser({
      username: "admin",
      passwordHash: hashPassword("admin1234"),
      pinHash: null,
      role: "admin",
      staffId: null,
      displayName: "Marcus Webb",
    });

    // devon / devon1234 / PIN 1492
    const uDevon = this.createUser({
      username: "devon",
      passwordHash: hashPassword("devon1234"),
      pinHash: hashPin("1492"),
      role: "lead_mechanic",
      staffId: s1.id,
      displayName: "Devon Thibodaux",
    });

    // janelle / janelle1234 / PIN 2837
    const uJanelle = this.createUser({
      username: "janelle",
      passwordHash: hashPassword("janelle1234"),
      pinHash: hashPin("2837"),
      role: "mechanic",
      staffId: s2.id,
      displayName: "Janelle Broussard",
    });

    // remy / remy1234 / PIN 5501
    const uRemy = this.createUser({
      username: "remy",
      passwordHash: hashPassword("remy1234"),
      pinHash: hashPin("5501"),
      role: "mechanic",
      staffId: s3.id,
      displayName: "Remy Fontenot",
    });

    // suppress unused variable warnings
    void uDevon; void uJanelle; void uRemy;

    // Customers
    const c1 = this.createCustomer({
      name: "Patricia Guidry",
      phone: "(337) 555-1100",
      email: "pguidry@email.com",
      address: "418 Johnston St",
      city: "Lafayette, LA",
      notes: "Prefers morning appointments.",
    });

    const c2 = this.createCustomer({
      name: "Terrence Mouton",
      phone: "(337) 555-2287",
      email: "tmouton@email.com",
      address: "902 Kaliste Saloom Rd",
      city: "Lafayette, LA",
    });

    const c3 = this.createCustomer({
      name: "Angela Hebert",
      phone: "(337) 555-3390",
      email: "ahebert@email.com",
      address: "221 Pinhook Rd",
      city: "Broussard, LA",
      notes: "Fleet of 2 vehicles.",
    });

    const c4 = this.createCustomer({
      name: "Derrick Sonnier",
      phone: "(337) 555-4401",
      city: "Youngsville, LA",
    });

    // Vehicles
    const v1 = this.createVehicle({
      customerId: c1.id,
      year: 2018,
      make: "Toyota",
      model: "Camry",
      color: "Silver",
      mileage: 87400,
      licensePlate: "ABC-1234",
    });

    const v2 = this.createVehicle({
      customerId: c2.id,
      year: 2015,
      make: "Chevrolet",
      model: "Silverado 1500",
      color: "Black",
      mileage: 134500,
      licensePlate: "XYZ-9876",
    });

    const v3 = this.createVehicle({
      customerId: c3.id,
      year: 2020,
      make: "Ford",
      model: "Escape",
      color: "Red",
      mileage: 52000,
    });

    const v4 = this.createVehicle({
      customerId: c3.id,
      year: 2017,
      make: "Dodge",
      model: "Caravan",
      color: "White",
      mileage: 98700,
    });

    const v5 = this.createVehicle({
      customerId: c4.id,
      year: 2019,
      make: "Honda",
      model: "CR-V",
      color: "Blue",
      mileage: 61200,
    });

    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const todayStr = fmt(today);
    const tomorrow = fmt(new Date(today.getTime() + 86400000));
    const yesterday = fmt(new Date(today.getTime() - 86400000));
    const lastWeek = fmt(new Date(today.getTime() - 7 * 86400000));
    const nextWeek = fmt(new Date(today.getTime() + 7 * 86400000));

    // Jobs — use actual staff IDs
    const j1 = this.createJob({
      customerId: c1.id,
      vehicleId: v1.id,
      assignedStaffId: s1.id,
      serviceType: "Oil Change & Filter",
      status: "complete",
      priority: "normal",
      scheduledAt: `${yesterday}T09:00`,
      estimateAmount: 85,
      notes: "Synthetic oil requested.",
      createdAt: `${lastWeek}T10:00:00Z`,
    });

    const j2 = this.createJob({
      customerId: c2.id,
      vehicleId: v2.id,
      assignedStaffId: s2.id,
      serviceType: "Brake Pad Replacement",
      status: "in_progress",
      priority: "high",
      scheduledAt: `${todayStr}T10:30`,
      estimateAmount: 220,
      notes: "Front brakes squealing. Check rotors too.",
      createdAt: `${yesterday}T08:00:00Z`,
    });

    const j3 = this.createJob({
      customerId: c3.id,
      vehicleId: v3.id,
      assignedStaffId: s1.id,
      serviceType: "AC Recharge",
      status: "scheduled",
      priority: "normal",
      scheduledAt: `${todayStr}T14:00`,
      estimateAmount: 150,
      createdAt: `${yesterday}T14:00:00Z`,
    });

    const j4 = this.createJob({
      customerId: c4.id,
      vehicleId: v5.id,
      assignedStaffId: s3.id,
      serviceType: "Check Engine Light Diagnostic",
      status: "pending",
      priority: "urgent",
      scheduledAt: `${tomorrow}T08:00`,
      estimateAmount: 95,
      notes: "CEL on. Customer says rough idle.",
      createdAt: `${todayStr}T07:30:00Z`,
    });

    const j5 = this.createJob({
      customerId: c3.id,
      vehicleId: v4.id,
      assignedStaffId: s2.id,
      serviceType: "Tire Rotation & Balance",
      status: "scheduled",
      priority: "low",
      scheduledAt: `${tomorrow}T11:00`,
      estimateAmount: 65,
      createdAt: `${todayStr}T09:00:00Z`,
    });

    const j6 = this.createJob({
      customerId: c1.id,
      vehicleId: v1.id,
      assignedStaffId: s1.id,
      serviceType: "Alternator Replacement",
      status: "complete",
      priority: "high",
      scheduledAt: `${lastWeek}T13:00`,
      estimateAmount: 480,
      createdAt: `${lastWeek}T06:00:00Z`,
    });

    // Invoices
    this.createInvoice({
      jobId: j1.id,
      customerId: c1.id,
      invoiceNumber: "INV-1001",
      status: "paid",
      amount: 85,
      taxAmount: 7.23,
      totalAmount: 92.23,
      issuedAt: yesterday,
      dueAt: todayStr,
      paidAt: todayStr,
    });

    this.createInvoice({
      jobId: j6.id,
      customerId: c1.id,
      invoiceNumber: "INV-1002",
      status: "paid",
      amount: 480,
      taxAmount: 40.80,
      totalAmount: 520.80,
      issuedAt: lastWeek,
      dueAt: fmt(new Date(today.getTime() - 3 * 86400000)),
      paidAt: fmt(new Date(today.getTime() - 2 * 86400000)),
    });

    this.createInvoice({
      jobId: j2.id,
      customerId: c2.id,
      invoiceNumber: "INV-1003",
      status: "draft",
      amount: 220,
      taxAmount: 18.70,
      totalAmount: 238.70,
      issuedAt: todayStr,
      dueAt: nextWeek,
    });

    this.createInvoice({
      jobId: j3.id,
      customerId: c3.id,
      invoiceNumber: "INV-1004",
      status: "sent",
      amount: 150,
      taxAmount: 12.75,
      totalAmount: 162.75,
      issuedAt: yesterday,
      dueAt: nextWeek,
    });

    this.createInvoice({
      jobId: null,
      customerId: c4.id,
      invoiceNumber: "INV-1005",
      status: "overdue",
      amount: 340,
      taxAmount: 28.90,
      totalAmount: 368.90,
      issuedAt: lastWeek,
      dueAt: yesterday,
    });
  }
}

export const storage = new DatabaseStorage();
