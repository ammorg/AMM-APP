import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { storage } from "./storage";
import { insertCustomerSchema, insertVehicleSchema, insertJobSchema } from "@shared/schema";

const SESSION_COOKIE = "amm_session";

function getSessionId(req: Request): string | undefined {
  const rawHeader = req.headers.cookie;
  const cookieHeader = Array.isArray(rawHeader) ? rawHeader.join("; ") : rawHeader || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").filter(Boolean).map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    }),
  );
  return cookies[SESSION_COOKIE];
}

function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const sessionId = getSessionId(req);
  if (sessionId) {
    const session = storage.getSession(sessionId);
    if (session) {
      const user = storage.getUserById(session.userId);
      if (user) {
        (req as any).currentUser = storage.toSafeUser(user);
      }
    }
  }
  next();
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const currentUser = (req as any).currentUser;
  if (!currentUser) return res.status(401).json({ error: "Not authenticated" });
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const currentUser = (req as any).currentUser;
  if (!currentUser) return res.status(401).json({ error: "Not authenticated" });
  if (currentUser.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}

export function registerJobWorkflowOverrides(app: Express) {
  app.use(authMiddleware);

  app.post("/api/customers", requireAdmin, (req, res) => {
    const parsed = insertCustomerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(storage.createCustomer(parsed.data));
  });

  app.patch("/api/customers/:id", requireAdmin, (req, res) => {
    const id = parseInt(req.params["id"] as string, 10);
    const parsed = insertCustomerSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = storage.updateCustomer(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.post("/api/vehicles", requireAdmin, (req, res) => {
    const parsed = insertVehicleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(storage.createVehicle(parsed.data));
  });

  app.patch("/api/vehicles/:id", requireAdmin, (req, res) => {
    const id = parseInt(req.params["id"] as string, 10);
    const parsed = insertVehicleSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = storage.updateVehicle(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.post("/api/jobs", requireAdmin, (req, res) => {
    const parsed = insertJobSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(storage.createJob(parsed.data));
  });

  app.patch("/api/jobs/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params["id"] as string, 10);
    const currentUser = (req as any).currentUser;
    const existing = storage.getJobById(id);
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (currentUser.role === "admin") {
      const parsed = insertJobSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const updated = storage.updateJob(id, parsed.data);
      return res.json(updated);
    }

    if (!currentUser.staffId || existing.assignedStaffId !== currentUser.staffId) {
      return res.status(403).json({ error: "Only the assigned mechanic can update this job." });
    }

    const statusOnlySchema = z.object({
      status: z.enum(["pending", "scheduled", "in_progress", "complete", "cancelled"]),
    });
    const parsed = statusOnlySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Mechanics can only update job status." });
    }

    const updated = storage.updateJob(id, { status: parsed.data.status });
    return res.json(updated);
  });

  app.get("/api/jobs/open", requireAuth, (req, res) => {
    const currentUser = (req as any).currentUser;
    if (currentUser.role === "admin") return res.json([]);

    const customers = storage.getAllCustomers();
    const vehicles = storage.getAllVehicles();

    const openJobs = storage
      .getAllJobs()
      .filter((job) => !job.assignedStaffId)
      .map((job) => {
        const customer = customers.find((c) => c.id === job.customerId) ?? null;
        const vehicle = vehicles.find((v) => v.id === job.vehicleId) ?? null;
        return {
          ...job,
          customerPreview: customer
            ? {
                id: customer.id,
                name: customer.name,
                city: customer.city ?? null,
                phone: null,
                email: null,
                address: null,
              }
            : null,
          vehiclePreview: vehicle
            ? {
                id: vehicle.id,
                year: vehicle.year,
                make: vehicle.make,
                model: vehicle.model,
                color: vehicle.color ?? null,
              }
            : null,
        };
      });

    res.json(openJobs);
  });

  app.post("/api/jobs/:id/accept", requireAuth, (req, res) => {
    const id = parseInt(req.params["id"] as string, 10);
    const currentUser = (req as any).currentUser;

    if (currentUser.role === "admin") {
      return res.status(403).json({ error: "Admins do not accept jobs." });
    }
    if (!currentUser.staffId) {
      return res.status(403).json({ error: "No staff profile linked to this account." });
    }

    const existing = storage.getJobById(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.assignedStaffId) {
      return res.status(409).json({ error: "This job has already been accepted." });
    }

    const updated = storage.updateJob(id, {
      assignedStaffId: currentUser.staffId,
      status: existing.status === "pending" ? "scheduled" : existing.status,
    });
    res.json(updated);
  });
}
