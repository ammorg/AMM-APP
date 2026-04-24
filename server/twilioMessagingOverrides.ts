import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { storage } from "./storage";

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

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getTwilioConfig() {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const fromNumber = env("TWILIO_FROM_NUMBER");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  return {
    accountSid,
    authToken,
    fromNumber,
    messagingServiceSid,
    isConfigured: Boolean(accountSid && authToken && (fromNumber || messagingServiceSid)),
  };
}

function getZohoMailConfigured() {
  return Boolean(env("ZOHO_MAIL_TOKEN"));
}

async function sendTwilioSms(toAddress: string, messageBody: string) {
  const cfg = getTwilioConfig();
  if (!cfg.isConfigured || !cfg.accountSid || !cfg.authToken) {
    throw new Error(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.",
    );
  }

  const params = new URLSearchParams({
    To: toAddress,
    Body: messageBody,
  });

  if (cfg.messagingServiceSid) {
    params.set("MessagingServiceSid", cfg.messagingServiceSid);
  } else if (cfg.fromNumber) {
    params.set("From", cfg.fromNumber);
  }

  const basicAuth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.message || payload.error_message || `Twilio request failed (${response.status})`);
  }
  return payload;
}

function syncIntegrationStatuses() {
  const twilioCfg = getTwilioConfig();
  storage.upsertIntegrationSetting("twilio", {
    status: twilioCfg.isConfigured ? "connected" : "disconnected",
  });
  storage.upsertIntegrationSetting("zoho_mail", {
    status: getZohoMailConfigured() ? "connected" : "disconnected",
  });
}

export function registerTwilioMessagingOverrides(app: Express) {
  app.use(authMiddleware);

  app.get("/api/integrations", requireAdmin, (_req, res) => {
    syncIntegrationStatuses();
    res.json(storage.getAllIntegrationSettings());
  });

  app.post("/api/messaging/send", requireAuth, async (req, res) => {
    const currentUser = (req as any).currentUser;
    if (currentUser.role === "mechanic") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

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

    syncIntegrationStatuses();

    const log = storage.createMessagingLog({
      ...parsed.data,
      jobId: parsed.data.jobId ?? null,
      customerId: parsed.data.customerId ?? null,
      status: "queued",
      createdAt: new Date().toISOString(),
    });

    try {
      if (parsed.data.channel === "sms") {
        const twilioCfg = getTwilioConfig();
        if (!twilioCfg.isConfigured) {
          const updated = storage.updateMessagingLog(log.id, { status: "queued" }) ?? log;
          return res.json({
            log: updated,
            connectorAvailable: false,
            channel: "sms",
            message: "Twilio is not configured yet.",
          });
        }

        const result = await sendTwilioSms(parsed.data.toAddress, parsed.data.messageBody);
        const updated = storage.updateMessagingLog(log.id, {
          status: "sent",
          sentAt: new Date().toISOString(),
        }) ?? log;

        return res.json({
          log: updated,
          connectorAvailable: true,
          channel: "sms",
          provider: "twilio",
          twilioMessageSid: result.sid ?? null,
        });
      }

      const zohoMailEnabled = getZohoMailConfigured();
      if (zohoMailEnabled) {
        const updated = storage.updateMessagingLog(log.id, {
          status: "sent",
          sentAt: new Date().toISOString(),
        }) ?? log;
        return res.json({
          log: updated,
          connectorAvailable: true,
          channel: "email",
          provider: "zoho_mail",
        });
      }

      const updated = storage.updateMessagingLog(log.id, { status: "queued" }) ?? log;
      return res.json({
        log: updated,
        connectorAvailable: false,
        channel: "email",
        message: "Zoho Mail is not configured yet.",
      });
    } catch (error: any) {
      const failed = storage.updateMessagingLog(log.id, {
        status: "failed",
      }) ?? log;
      return res.status(502).json({
        error: error?.message || "Message send failed",
        log: failed,
        connectorAvailable:
          parsed.data.channel === "sms" ? getTwilioConfig().isConfigured : getZohoMailConfigured(),
      });
    }
  });
}
