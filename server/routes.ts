import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertBusinessProfileSchema, insertStaffSchema, insertCustomerSchema,
  insertVehicleSchema, insertJobSchema, insertInvoiceSchema,
  insertEstimateApprovalSchema, insertJobCompletionSchema,
  insertMessagingLogSchema, insertIntegrationSettingsSchema, insertPayrollSettingsSchema,
  type SafeUser,
} from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";

// ── Session middleware helpers ─────────────────────────────────────────────────
const SESSION_COOKIE = "amm_session";
const SESSION_MAX_AGE = 7 * 24 * 3600;

function getSessionId(req: Request): string | undefined {
  // Read from cookie header manually (no cookie-parser needed)
  const rawHeader = req.headers.cookie;
  const cookieHeader = Array.isArray(rawHeader) ? rawHeader.join("; ") : (rawHeader || "");
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map(c => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    })
  );
  return cookies[SESSION_COOKIE];
}

/**
 * Determine whether the current request is over a secure context.
 * In deployment behind a TLS-terminating proxy, we rely on the
 * X-Forwarded-Proto header. Falls back to checking req.secure.
 */
function isSecureRequest(req: Request): boolean {
  const proto = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(proto) ? proto[0] : proto;
  return req.secure || forwardedProto === "https";
}

/**
 * Build Set-Cookie attributes that work in both regular browsers and
 * embedded webviews (e.g. iOS WKWebView, Android WebView, in-app browsers).
 *
 * - Over HTTPS: SameSite=None; Secure  — required for third-party / cross-site
 *   embedded contexts. SameSite=None without Secure is rejected by modern browsers
 *   so we only set it when we know the transport is secure.
 * - Over HTTP (local dev): SameSite=Lax — safe default for same-site development.
 */
function sessionCookieAttributes(req: Request): string {
  if (isSecureRequest(req)) {
    return `Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_MAX_AGE}`;
  }
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

function setSessionCookie(res: Response, sessionId: string, req: Request) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; ${sessionCookieAttributes(req)}`
  );
}

function clearSessionCookie(res: Response, req: Request) {
  const attrs = isSecureRequest(req)
    ? `Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`
    : `Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; ${attrs}`);
}

// Extend Express Request with auth context
declare global {
  namespace Express {
    interface Request {
      currentUser?: SafeUser;
    }
  }
}

// Auth middleware — attaches currentUser to request if session valid
function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const sessionId = getSessionId(req);
  if (sessionId) {
    const session = storage.getSession(sessionId);
    if (session) {
      const user = storage.getUserById(session.userId);
      if (user) {
        req.currentUser = storage.toSafeUser(user);
      }
    }
  }
  next();
}

// Route guard — requires authenticated user
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

// Route guard — requires admin role
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) return res.status(401).json({ error: "Not authenticated" });
  if (req.currentUser.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Apply auth middleware globally
  app.use(authMiddleware);

  // ── Seed ──────────────────────────────────────────────────────────────────
  app.post("/api/seed", (_req, res) => {
    try {
      storage.seed();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/seed/status", (_req, res) => {
    res.json({ seeded: storage.isSeeded() });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  });

  app.post("/api/auth/login", (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid credentials" });

    const safeUser = storage.verifyCredentials(parsed.data.username, parsed.data.password);
    if (!safeUser) return res.status(401).json({ error: "Invalid username or password" });

    const session = storage.createSession(safeUser.id);
    setSessionCookie(res, session.id, req);
    res.json({ user: safeUser });
  });

  app.post("/api/auth/logout", (req, res) => {
    const sessionId = getSessionId(req);
    if (sessionId) storage.deleteSession(sessionId);
    clearSessionCookie(res, req);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: req.currentUser });
  });

  // PIN login (staff only)
  const pinLoginSchema = z.object({ pin: z.string().min(4).max(6) });
  app.post("/api/auth/pin-login", (req, res) => {
    const parsed = pinLoginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid PIN" });
    const safeUser = storage.verifyPinLogin(parsed.data.pin);
    if (!safeUser) return res.status(401).json({ error: "Invalid PIN" });
    const session = storage.createSession(safeUser.id);
    setSessionCookie(res, session.id, req);
    res.json({ user: safeUser });
  });

  // ── Business Profile ──────────────────────────────────────────────────────
  app.get("/api/business-profile", requireAuth, (_req, res) => {
    const profile = storage.getBusinessProfile();
    if (!profile) return res.status(404).json({ error: "Not found" });
    res.json(profile);
  });

  app.put("/api/business-profile", requireAdmin, (req, res) => {
    const parsed = insertBusinessProfileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const profile = storage.upsertBusinessProfile(parsed.data);
    res.json(profile);
  });

  // ── Staff ─────────────────────────────────────────────────────────────────
  app.get("/api/staff", requireAuth, (_req, res) => {
    res.json(storage.getAllStaff());
  });

  app.get("/api/staff/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    const member = storage.getStaffById(id);
    if (!member) return res.status(404).json({ error: "Not found" });
    res.json(member);
  });

  app.post("/api/staff", requireAdmin, (req, res) => {
    const parsed = insertStaffSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(storage.createStaff(parsed.data));
  });

  app.patch("/api/staff/:id", requireAdmin, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    const parsed = insertStaffSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = storage.updateStaff(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/staff/:id", requireAdmin, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    storage.deleteStaff(id);
    res.json({ ok: true });
  });

  // ── Customers ─────────────────────────────────────────────────────────────
  app.get("/api/customers", requireAuth, (req, res) => {
    const user = req.currentUser!;
    if (user.role === "admin") {
      return res.json(storage.getAllCustomers());
    }
    // Non-admin: only customers linked to their assigned jobs
    if (user.staffId) {
      return res.json(storage.getCustomersByStaffId(user.staffId));
    }
    return res.json([]);
  });

  app.get("/api/customers/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    const customer = storage.getCustomerById(id);
    if (!customer) return res.status(404).json({ error: "Not found" });
    res.json(customer);
  });

  app.post("/api/customers", requireAuth, (req, res) => {
    const parsed = insertCustomerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(storage.createCustomer(parsed.data));
  });

  app.patch("/api/customers/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    const parsed = insertCustomerSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = storage.updateCustomer(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  // ── Vehicles ──────────────────────────────────────────────────────────────
  app.get("/api/vehicles", requireAuth, (_req, res) => {
    res.json(storage.getAllVehicles());
  });

  app.get("/api/vehicles/customer/:customerId", requireAuth, (req, res) => {
    const customerId = parseInt(req.params["customerId"] as string);
    res.json(storage.getVehiclesByCustomer(customerId));
  });

  app.post("/api/vehicles", requireAuth, (req, res) => {
    const parsed = insertVehicleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(storage.createVehicle(parsed.data));
  });

  app.patch("/api/vehicles/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    const parsed = insertVehicleSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = storage.updateVehicle(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  // ── Jobs ──────────────────────────────────────────────────────────────────
  app.get("/api/jobs", requireAuth, (req, res) => {
    const user = req.currentUser!;
    if (user.role === "admin") {
      return res.json(storage.getAllJobs());
    }
    // Non-admin: only own assigned jobs
    if (user.staffId) {
      return res.json(storage.getJobsByStaffId(user.staffId));
    }
    return res.json([]);
  });

  app.get("/api/jobs/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    const job = storage.getJobById(id);
    if (!job) return res.status(404).json({ error: "Not found" });
    res.json(job);
  });

  app.post("/api/jobs", requireAuth, (req, res) => {
    const parsed = insertJobSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(storage.createJob(parsed.data));
  });

  app.patch("/api/jobs/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    const parsed = insertJobSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = storage.updateJob(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  // ── Invoices ──────────────────────────────────────────────────────────────
  app.get("/api/invoices", requireAuth, (req, res) => {
    const user = req.currentUser!;
    if (user.role === "admin") {
      return res.json(storage.getAllInvoices());
    }
    // Non-admin: invoices for their customers only
    if (user.staffId) {
      const myCustomers = storage.getCustomersByStaffId(user.staffId);
      const customerIds = myCustomers.map(c => c.id);
      return res.json(storage.getInvoicesByCustomerIds(customerIds));
    }
    return res.json([]);
  });

  app.get("/api/invoices/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    const invoice = storage.getInvoiceById(id);
    if (!invoice) return res.status(404).json({ error: "Not found" });
    res.json(invoice);
  });

  app.post("/api/invoices", requireAuth, (req, res) => {
    const parsed = insertInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(storage.createInvoice(parsed.data));
  });

  app.patch("/api/invoices/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    const parsed = insertInvoiceSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = storage.updateInvoice(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  // ── Estimate Approvals ───────────────────────────────────────────

  // Public route — no auth required
  app.get("/api/estimate-approvals/public/:token", (req, res) => {
    const token = req.params["token"] as string;
    const approval = storage.getEstimateApprovalByToken(token);
    if (!approval) return res.status(404).json({ error: "Not found" });
    // Enrich with customer info
    const customer = storage.getCustomerById(approval.customerId);
    res.json({ ...approval, customer });
  });

  // Public action — customer approves or declines
  app.post("/api/estimate-approvals/public/:token/respond", (req, res) => {
    const token = req.params["token"] as string;
    const approval = storage.getEstimateApprovalByToken(token);
    if (!approval) return res.status(404).json({ error: "Not found" });
    if (approval.status !== "pending") return res.status(409).json({ error: "Already responded" });
    const schema = z.object({ action: z.enum(["approved", "declined"]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid action" });
    const updated = storage.updateEstimateApproval(approval.id, {
      status: parsed.data.action,
      approvedAt: new Date().toISOString(),
    });
    res.json(updated);
  });

  // Auth-gated: create approval
  app.post("/api/estimate-approvals", requireAuth, (req, res) => {
    const user = req.currentUser!;
    if (user.role === "mechanic") return res.status(403).json({ error: "Insufficient permissions" });
    const token = crypto.randomBytes(16).toString("hex");
    const parsed = insertEstimateApprovalSchema.omit({ token: true, createdAt: true }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const approval = storage.createEstimateApproval({
      ...parsed.data,
      token,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(approval);
  });

  // Auth-gated: list all approvals
  app.get("/api/estimate-approvals", requireAuth, (req, res) => {
    const user = req.currentUser!;
    if (user.role === "admin") {
      return res.json(storage.getAllEstimateApprovals());
    }
    // Lead mechs see all; mechanics see only their customer approvals
    if (user.role === "lead_mechanic") {
      return res.json(storage.getAllEstimateApprovals());
    }
    return res.json([]);
  });

  // Auth-gated: single by id
  app.get("/api/estimate-approvals/:id", requireAuth, (req, res) => {
    const approvals = storage.getAllEstimateApprovals();
    const id = parseInt(req.params["id"] as string);
    const found = approvals.find(a => a.id === id);
    if (!found) return res.status(404).json({ error: "Not found" });
    res.json(found);
  });

  // ── Estimator seed data ───────────────────────────────────────────────────
  app.get("/api/estimator/seed", requireAuth, (_req, res) => {
    // Serve the estimator seed data (embedded — no filesystem read needed in prod)
    res.json(ESTIMATOR_SEED);
  });


  // ── Job Completions (phase 4) ─────────────────────────────────────────────
  // GET /api/jobs/:id/completion — fetch completion record for a job
  app.get("/api/jobs/:id/completion", requireAuth, (req, res) => {
    const jobId = parseInt(req.params["id"] as string);
    const record = storage.getJobCompletion(jobId);
    res.json(record ?? null);
  });

  // PATCH /api/jobs/:id/completion — upsert completion fields
  app.patch("/api/jobs/:id/completion", requireAuth, (req, res) => {
    const jobId = parseInt(req.params["id"] as string);
    const user = req.currentUser!;
    const bodySchema = insertJobCompletionSchema.partial().omit({ jobId: true, createdAt: true, updatedAt: true });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    // Payment fields admin/lead only
    if ((parsed.data.paymentLink || parsed.data.paymentAmountDue !== undefined || parsed.data.paymentStatus) &&
      user.role === "mechanic") {
      return res.status(403).json({ error: "Payment fields require admin or lead_mechanic" });
    }
    const record = storage.upsertJobCompletion(jobId, parsed.data);
    res.json(record);
  });

  // POST /api/jobs/:id/completion/photos — add a vehicle photo (base64)
  app.post("/api/jobs/:id/completion/photos", requireAuth, (req, res) => {
    const jobId = parseInt(req.params["id"] as string);
    const schema = z.object({ photo: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid photo data" });
    const existing = storage.getJobCompletion(jobId);
    const currentPhotos: string[] = existing?.vehiclePhotos ? JSON.parse(existing.vehiclePhotos) : [];
    currentPhotos.push(parsed.data.photo);
    const record = storage.upsertJobCompletion(jobId, { vehiclePhotos: JSON.stringify(currentPhotos) });
    res.json(record);
  });

  // DELETE /api/jobs/:id/completion/photos/:index
  app.delete("/api/jobs/:id/completion/photos/:index", requireAuth, (req, res) => {
    const jobId = parseInt(req.params["id"] as string);
    const idx = parseInt(req.params["index"] as string);
    const existing = storage.getJobCompletion(jobId);
    if (!existing) return res.status(404).json({ error: "No completion record" });
    const photos: string[] = existing.vehiclePhotos ? JSON.parse(existing.vehiclePhotos) : [];
    photos.splice(idx, 1);
    const record = storage.upsertJobCompletion(jobId, { vehiclePhotos: JSON.stringify(photos) });
    res.json(record);
  });

  // GET /api/job-completions — all (admin payroll view)
  app.get("/api/job-completions", requireAdmin, (_req, res) => {
    res.json(storage.getAllJobCompletions());
  });

  // PATCH /api/job-completions/:jobId/payout — mark tech payout paid
  app.patch("/api/job-completions/:jobId/payout", requireAdmin, (req, res) => {
    const jobId = parseInt(req.params["jobId"] as string);
    const schema = z.object({
      techPayoutAmount: z.number().optional(),
      techPayoutPaid: z.union([z.literal(0), z.literal(1)]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const record = storage.upsertJobCompletion(jobId, {
      ...parsed.data,
      techPayoutPaidAt: parsed.data.techPayoutPaid === 1 ? new Date().toISOString() : undefined,
    });
    res.json(record);
  });

  // ── Messaging (phase 4) ────────────────────────────────────────────────────
  app.get("/api/messaging/logs", requireAuth, (req, res) => {
    const user = req.currentUser!;
    if (user.role === "admin") return res.json(storage.getAllMessagingLogs());
    return res.json([]);
  });

  app.post("/api/messaging/send", requireAuth, (req, res) => {
    const user = req.currentUser!;
    if (user.role === "mechanic") return res.status(403).json({ error: "Insufficient permissions" });
    const schema = z.object({
      jobId: z.number().optional(),
      customerId: z.number().optional(),
      channel: z.enum(["sms", "email"]),
      template: z.string(),
      toAddress: z.string().min(1),
      messageBody: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const log = storage.createMessagingLog({
      ...parsed.data,
      jobId: parsed.data.jobId ?? null,
      customerId: parsed.data.customerId ?? null,
      status: "queued",
      createdAt: new Date().toISOString(),
    });

    const twilioEnabled = !!process.env.TWILIO_ACCOUNT_SID;
    const zohoMailEnabled = !!process.env.ZOHO_MAIL_TOKEN;

    if (parsed.data.channel === "sms" && twilioEnabled) {
      storage.updateMessagingLog(log.id, { status: "sent", sentAt: new Date().toISOString() });
    } else if (parsed.data.channel === "email" && zohoMailEnabled) {
      storage.updateMessagingLog(log.id, { status: "sent", sentAt: new Date().toISOString() });
    }

    const updated = storage.getAllMessagingLogs().find(l => l.id === log.id) ?? log;
    res.json({ log: updated, connectorAvailable: twilioEnabled || zohoMailEnabled });
  });

  // ── Integration Settings (phase 4) ────────────────────────────────────────
  app.get("/api/integrations", requireAdmin, (_req, res) => {
    res.json(storage.getAllIntegrationSettings());
  });

  app.patch("/api/integrations/:service", requireAdmin, (req, res) => {
    const service = req.params["service"] as string;
    const parsed = insertIntegrationSettingsSchema.partial().omit({ service: true, updatedAt: true }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const record = storage.upsertIntegrationSetting(service, parsed.data);
    res.json(record);
  });

  // Zoho sync adapter stubs
  app.post("/api/integrations/zoho/sync/customer/:id", requireAdmin, (req, res) => {
    const customerId = parseInt(req.params["id"] as string);
    const customer = storage.getCustomerById(customerId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!process.env.ZOHO_CRM_TOKEN) {
      return res.json({ synced: false, message: "Zoho CRM not connected. Set ZOHO_CRM_TOKEN env to activate." });
    }
    res.json({ synced: true, customerId, zohoContactId: null });
  });

  app.post("/api/integrations/zoho/sync/invoice/:id", requireAdmin, (req, res) => {
    const invoiceId = parseInt(req.params["id"] as string);
    const invoice = storage.getInvoiceById(invoiceId);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (!process.env.ZOHO_BOOKS_TOKEN) {
      return res.json({ synced: false, message: "Zoho Books not connected. Set ZOHO_BOOKS_TOKEN env to activate." });
    }
    res.json({ synced: true, invoiceId, zohoBooksInvoiceId: null });
  });

  // ── Payroll (phase 4) ──────────────────────────────────────────────────────
  app.get("/api/payroll/settings", requireAdmin, (_req, res) => {
    res.json(storage.getAllPayrollSettings());
  });

  app.patch("/api/payroll/settings/:staffId", requireAdmin, (req, res) => {
    const staffId = parseInt(req.params["staffId"] as string);
    const schema = z.object({
      payoutType: z.enum(["percentage", "flat_per_job"]).optional(),
      payoutRate: z.number().min(0).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const record = storage.upsertPayrollSetting(staffId, parsed.data);
    res.json(record);
  });

  app.get("/api/payroll/summary", requireAdmin, (_req, res) => {
    const completedJobs = storage.getAllJobs().filter(j => j.status === "complete");
    const completions = storage.getAllJobCompletions();
    const allStaff = storage.getAllStaff();
    const payrollSettingsList = storage.getAllPayrollSettings();

    const summary = allStaff.map(s => {
      const staffJobs = completedJobs.filter(j => j.assignedStaffId === s.id);
      const payrollSetting = payrollSettingsList.find(p => p.staffId === s.id);
      const rate = payrollSetting?.payoutRate ?? 40;
      const payoutType = payrollSetting?.payoutType ?? "percentage";

      const jobDetails = staffJobs.map(j => {
        const completion = completions.find(c => c.jobId === j.id);
        const revenue = j.estimateAmount ?? 0;
        const payout = payoutType === "percentage" ? (revenue * rate / 100) : rate;
        return {
          jobId: j.id,
          serviceType: j.serviceType,
          revenue,
          payout,
          payoutPaid: completion?.techPayoutPaid === 1,
          payoutPaidAt: completion?.techPayoutPaidAt ?? null,
          paymentStatus: completion?.paymentStatus ?? "pending",
        };
      });

      return {
        staffId: s.id,
        staffName: s.name,
        role: s.role,
        payoutType,
        payoutRate: rate,
        jobCount: staffJobs.length,
        totalRevenue: jobDetails.reduce((a, j) => a + j.revenue, 0),
        totalPayout: jobDetails.reduce((a, j) => a + j.payout, 0),
        pendingPayout: jobDetails.filter(j => !j.payoutPaid).reduce((a, j) => a + j.payout, 0),
        jobs: jobDetails,
      };
    });

    res.json(summary);
  });

    return httpServer;
}

// ── Embedded estimator seed data ──────────────────────────────────────────────
const ESTIMATOR_SEED = {
  services: [
    { id: "oil-change", name: "Oil Change", bases: { kbb: [72, 118], napa: [68, 112], ym: 99, rp: [79, 121] } },
    { id: "battery-replacement", name: "Battery Replacement", bases: { kbb: [185, 295], napa: [176, 284], ym: 239, rp: [194, 301] } },
    { id: "brake-pad-replacement", name: "Brake Pad Replacement", bases: { kbb: [245, 418], napa: [228, 395], ym: 329, rp: [258, 429] } },
    { id: "starter-replacement", name: "Starter Replacement", bases: { kbb: [395, 735], napa: [372, 706], ym: 589, rp: [418, 748] } },
    { id: "alternator-replacement", name: "Alternator Replacement", bases: { kbb: [468, 866], napa: [452, 838], ym: 679, rp: [492, 884] } },
    { id: "radiator-replacement", name: "Radiator Replacement", bases: { kbb: [512, 958], napa: [489, 925], ym: 749, rp: [538, 982] } },
    { id: "serpentine-belt", name: "Serpentine Belt Replacement", bases: { kbb: [118, 242], napa: [109, 228], ym: 179, rp: [124, 249] } },
    { id: "spark-plugs", name: "Spark Plug Replacement", bases: { kbb: [188, 436], napa: [175, 409], ym: 289, rp: [196, 448] } },
    { id: "front-struts", name: "Front Strut Assembly Replacement", bases: { kbb: [686, 1384], napa: [652, 1325], ym: 1029, rp: [712, 1412] } },
    { id: "water-pump", name: "Water Pump Replacement", bases: { kbb: [456, 968], napa: [438, 934], ym: 719, rp: [472, 989] } },
    { id: "pre-purchase-inspection", name: "Pre-Purchase Inspection", bases: { kbb: [128, 235], napa: [119, 219], ym: 179, rp: [134, 244] } },
    { id: "general-diagnostics", name: "General Diagnostics", bases: { kbb: [109, 189], napa: [102, 176], ym: 149, rp: [115, 196] } },
    { id: "general-labor-hourly", name: "General Labor (per hour)", bases: { kbb: [125, 125], napa: [125, 125], ym: 125, rp: [125, 125] }, fixedHourly: 125 },
    { id: "hose-replacement", name: "Hose Replacement", bases: { kbb: [156, 348], napa: [148, 332], ym: 249, rp: [164, 359] } },
    { id: "control-arm-bushings", name: "Control Arm Bushings", bases: { kbb: [338, 712], napa: [324, 689], ym: 529, rp: [354, 728] } },
    { id: "high-pressure-fuel-pump", name: "High Pressure Fuel Pump", bases: { kbb: [744, 1496], napa: [716, 1452], ym: 1099, rp: [778, 1524] } },
    { id: "shocks", name: "Shocks Replacement", bases: { kbb: [324, 689], napa: [309, 664], ym: 498, rp: [338, 706] } },
    { id: "wheel-hub-assembly", name: "Wheel Hub Assembly", bases: { kbb: [286, 612], napa: [274, 589], ym: 439, rp: [301, 628] } },
    { id: "knock-sensor", name: "Knock Sensor Replacement", bases: { kbb: [248, 566], napa: [236, 544], ym: 389, rp: [259, 579] } },
    { id: "camshaft-position-sensor", name: "Camshaft Position Sensor", bases: { kbb: [176, 386], napa: [168, 372], ym: 279, rp: [184, 394] } },
    { id: "o2-sensor", name: "O2 Sensor Replacement", bases: { kbb: [164, 348], napa: [155, 336], ym: 249, rp: [172, 359] } },
    { id: "throttle-body", name: "Throttle Body Service/Replacement", bases: { kbb: [286, 684], napa: [271, 652], ym: 469, rp: [299, 699] } },
    { id: "mass-airflow", name: "Mass Airflow Sensor", bases: { kbb: [176, 418], napa: [168, 396], ym: 289, rp: [184, 429] } },
    { id: "motor-mounts", name: "Motor Mounts", bases: { kbb: [418, 962], napa: [399, 928], ym: 689, rp: [442, 986] } },
    { id: "oil-pan-gasket", name: "Oil Pan Gasket", bases: { kbb: [356, 842], napa: [338, 812], ym: 589, rp: [374, 859] } },
    { id: "valve-cover-gasket-cleaning", name: "Valve Cover Gasket / Cleaning", bases: { kbb: [186, 482], napa: [178, 462], ym: 319, rp: [194, 494] } },
    { id: "ignition-switch", name: "Ignition Switch Replacement", bases: { kbb: [236, 528], napa: [226, 507], ym: 379, rp: [248, 539] } },
    { id: "ignition-cylinder", name: "Ignition Cylinder Replacement", bases: { kbb: [264, 612], napa: [252, 586], ym: 439, rp: [278, 624] } },
    { id: "shift-cables", name: "Shift Cables", bases: { kbb: [286, 684], napa: [271, 656], ym: 479, rp: [301, 699] } },
    { id: "master-cylinder", name: "Master Cylinder Replacement", bases: { kbb: [324, 742], napa: [309, 716], ym: 528, rp: [338, 759] } },
    { id: "ignition-coil", name: "Ignition Coil Replacement", bases: { kbb: [148, 356], napa: [139, 342], ym: 239, rp: [154, 366] } },
    { id: "battery-terminals-cables", name: "Battery Terminals / Cables", bases: { kbb: [98, 228], napa: [92, 216], ym: 159, rp: [104, 236] } },
    { id: "thermostat", name: "Thermostat Replacement", bases: { kbb: [218, 496], napa: [206, 476], ym: 359, rp: [228, 508] } },
    { id: "radiator-cooling-fan", name: "Radiator / Cooling Fan", bases: { kbb: [326, 784], napa: [314, 756], ym: 549, rp: [342, 802] } },
    { id: "transmission-oil-flush", name: "Transmission Oil Flush", bases: { kbb: [168, 298], napa: [159, 286], ym: 229, rp: [176, 309] } },
  ],
  vehicles: [
    { make: "Toyota", model: "Camry", class: "sedan", factor: 0.98 },
    { make: "Honda", model: "Accord", class: "sedan", factor: 1.0 },
    { make: "Nissan", model: "Altima", class: "sedan", factor: 0.97 },
    { make: "Ford", model: "F-150", class: "truck", factor: 1.18 },
    { make: "Chevrolet", model: "Silverado 1500", class: "truck", factor: 1.2 },
    { make: "Toyota", model: "RAV4", class: "suv", factor: 1.08 },
    { make: "Honda", model: "CR-V", class: "suv", factor: 1.06 },
    { make: "Jeep", model: "Wrangler", class: "suv", factor: 1.14 },
    { make: "BMW", model: "3 Series", class: "luxury", factor: 1.32 },
    { make: "Mercedes-Benz", model: "C-Class", class: "luxury", factor: 1.36 },
  ],
};
