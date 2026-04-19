import express from "express";
import { db } from "./db";
import { jobs, announcements } from "../shared/schema";
import { eq, and, lt } from "drizzle-orm";
import { requireAuth } from "./middleware";

const router = express.Router();

//
// 🔐 AUTH CHECK TEST
//
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

//
// 🧾 CREATE JOB
//
router.post("/jobs", requireAuth, async (req, res) => {
  const job = await db.insert(jobs).values(req.body).returning();
  res.json(job);
});

//
// 📋 GET JOBS
//
router.get("/jobs", requireAuth, async (req, res) => {
  if (req.user.role === "mechanic") {
    const data = await db.select().from(jobs)
      .where(eq(jobs.assignedTo, req.user.mechanicId));
    return res.json(data);
  }

  const all = await db.select().from(jobs);
  res.json(all);
});

//
// 🚨 OFFER JOB
//
router.post("/jobs/:id/offer", requireAuth, async (req, res) => {
  const expires = new Date(Date.now() + 2 * 60 * 1000);

  await db.update(jobs)
    .set({
      assignmentStatus: "offered",
      assignedTo: req.body.mechanicId,
      assignmentExpiresAt: expires
    })
    .where(eq(jobs.id, Number(req.params.id)));

  res.send("Job offered");
});

//
// ✅ ACCEPT JOB
//
router.post("/jobs/:id/accept", requireAuth, async (req, res) => {
  await db.update(jobs)
    .set({ assignmentStatus: "accepted" })
    .where(eq(jobs.id, Number(req.params.id)));

  res.send("Accepted");
});

//
// ❌ DECLINE JOB
//
router.post("/jobs/:id/decline", requireAuth, async (req, res) => {
  await db.update(jobs)
    .set({ assignmentStatus: "declined" })
    .where(eq(jobs.id, Number(req.params.id)));

  res.send("Declined");
});

//
// 🔧 UPDATE STATUS
//
router.patch("/jobs/:id/status", requireAuth, async (req, res) => {
  const { status } = req.body;

  await db.update(jobs)
    .set({ status })
    .where(eq(jobs.id, Number(req.params.id)));

  res.send("Updated");
});

//
// 💳 MARK PAID
//
router.patch("/jobs/:id/paid", requireAuth, async (req, res) => {
  await db.update(jobs)
    .set({ paymentStatus: "paid" })
    .where(eq(jobs.id, Number(req.params.id)));

  res.send("Paid");
});

//
// 📢 ANNOUNCEMENTS
//
router.get("/announcements", requireAuth, async (req, res) => {
  const now = new Date();

  const data = await db.select().from(announcements)
    .where(and(
      eq(announcements.isActive, true),
      lt(announcements.expiresAt, new Date(now.getTime() + 100000000))
    ));

  res.json(data);
});

router.post("/announcements", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).send("Forbidden");
  }

  const { title, message, days } = req.body;

  const expires = new Date(Date.now() + days * 86400000);

  await db.insert(announcements).values({
    title,
    message,
    expiresAt: expires
  });

  res.send("Created");
});

export default router;