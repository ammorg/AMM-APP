import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db, storage } from "./storage";
import { insertStaffSchema, users, sessions, jobs, payrollSettings } from "@shared/schema";

const SESSION_COOKIE = "amm_session";
const SESSION_MAX_AGE = 7 * 24 * 3600;

function getSessionId(req: Request): string | undefined {
  const rawHeader = req.headers.cookie;
  const cookieHeader = Array.isArray(rawHeader) ? rawHeader.join("; ") : (rawHeader || "");
  const cookies = Object.fromEntries(
    cookieHeader.split(";").filter(Boolean).map(c => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    })
  );
  return cookies[SESSION_COOKIE];
}

function isSecureRequest(req: Request): boolean {
  const proto = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(proto) ? proto[0] : proto;
  return req.secure || forwardedProto === "https";
}

function sessionCookieAttributes(req: Request): string {
  if (isSecureRequest(req)) {
    return `Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_MAX_AGE}`;
  }
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

function setSessionCookie(res: Response, sessionId: string, req: Request) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; ${sessionCookieAttributes(req)}`);
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

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const currentUser = (req as any).currentUser;
  if (!currentUser) return res.status(401).json({ error: "Not authenticated" });
  if (currentUser.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update("amm_salt_2026:" + password).digest("hex");
}

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update("amm_pin_2026:" + pin).digest("hex");
}

function normalizeUsername(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `staff_${Date.now()}`;
}

function ensureUniqueUsername(base: string, excludeUserId?: number): string {
  let candidate = base;
  let i = 1;
  while (true) {
    const existing = storage.getUserByUsername(candidate);
    if (!existing || (excludeUserId && existing.id === excludeUserId)) return candidate;
    candidate = `${base}_${i++}`;
  }
}

function ensureUniquePin(pin: string, excludeUserId?: number): void {
  const hashed = hashPin(pin);
  const existing = db.select().from(users).all().find((u) => u.pinHash === hashed && (!excludeUserId || u.id !== excludeUserId));
  if (existing) {
    throw new Error("That 4-digit PIN is already in use. Please choose a different PIN.");
  }
}

function mapStaffRoleToUserRole(staffRole?: string | null): "admin" | "lead_mechanic" | "mechanic" {
  const normalized = (staffRole ?? "").toLowerCase();
  if (normalized.includes("lead")) return "lead_mechanic";
  if (normalized.includes("admin") || normalized.includes("owner") || normalized.includes("dispatch")) return "admin";
  return "mechanic";
}

export function registerTeamPinOverrides(app: Express) {
  app.use(authMiddleware);

  const strictPinLoginSchema = z.object({ pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits") });
  app.post("/api/auth/pin-login", (req, res) => {
    const parsed = strictPinLoginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid PIN" });
    const safeUser = storage.verifyPinLogin(parsed.data.pin);
    if (!safeUser) return res.status(401).json({ error: "Invalid PIN" });
    const session = storage.createSession(safeUser.id);
    setSessionCookie(res, session.id, req);
    res.json({ user: safeUser });
  });

  const staffPinSchema = insertStaffSchema.extend({
    pin: z.string().regex(/^\d{4}$/).optional().nullable(),
  });

  app.post("/api/staff", requireAdmin, (req, res) => {
    const parsed = staffPinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const { pin, ...staffData } = parsed.data;
      const member = storage.createStaff(staffData);

      if (pin) {
        ensureUniquePin(pin);
        const username = ensureUniqueUsername(normalizeUsername(member.name));
        storage.createUser({
          username,
          passwordHash: hashPassword("changeme1234"),
          pinHash: hashPin(pin),
          role: mapStaffRoleToUserRole(member.role),
          staffId: member.id,
          displayName: member.name,
        } as any);
      }

      res.status(201).json(member);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Failed to create team member" });
    }
  });

  app.patch("/api/staff/:id", requireAdmin, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    const parsed = staffPinSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const { pin, ...staffData } = parsed.data;
      const updated = storage.updateStaff(id, staffData);
      if (!updated) return res.status(404).json({ error: "Not found" });

      const existingUser = db.select().from(users).where(eq(users.staffId, id)).get();

      if (pin !== undefined) {
        if (pin) {
          if (existingUser) {
            ensureUniquePin(pin, existingUser.id);
            db.update(users)
              .set({
                pinHash: hashPin(pin),
                role: mapStaffRoleToUserRole(updated.role),
                displayName: updated.name,
              })
              .where(eq(users.id, existingUser.id))
              .run();
          } else {
            ensureUniquePin(pin);
            const username = ensureUniqueUsername(normalizeUsername(updated.name));
            storage.createUser({
              username,
              passwordHash: hashPassword("changeme1234"),
              pinHash: hashPin(pin),
              role: mapStaffRoleToUserRole(updated.role),
              staffId: updated.id,
              displayName: updated.name,
            } as any);
          }
        }
      } else if (existingUser) {
        db.update(users)
          .set({
            role: mapStaffRoleToUserRole(updated.role),
            displayName: updated.name,
          })
          .where(eq(users.id, existingUser.id))
          .run();
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Failed to update team member" });
    }
  });

  app.delete("/api/staff/:id", requireAdmin, (req, res) => {
    const id = parseInt(req.params["id"] as string);
    const linkedUsers = db.select().from(users).where(eq(users.staffId, id)).all();

    if (linkedUsers.length) {
      const userIds = linkedUsers.map((u) => u.id);
      db.delete(sessions).where(inArray(sessions.userId, userIds)).run();
      db.delete(users).where(inArray(users.id, userIds)).run();
    }

    db.update(jobs).set({ assignedStaffId: null }).where(eq(jobs.assignedStaffId, id)).run();
    db.delete(payrollSettings).where(eq(payrollSettings.staffId, id)).run();
    storage.deleteStaff(id);
    res.json({ ok: true });
  });
}
