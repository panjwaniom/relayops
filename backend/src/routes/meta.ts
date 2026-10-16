import { Router } from "express";
import { dbAll, dbGet, dbRun } from "../db";
import { asyncHandler, requireAuth } from "../auth";

const router = Router();
router.use(requireAuth);

router.get("/summary", asyncHandler(async (_req: any, res: any) => {
  const integrations = await dbAll(`SELECT * FROM integrations`);
  const jobs = await dbAll(`SELECT * FROM jobs ORDER BY created_at DESC`);
  const recent = jobs.slice(0, 60);
  const ok = jobs.filter((j: any) => j.status === "success").length;
  const failed = jobs.filter((j: any) => j.status === "failed" || j.status === "partial").length;
  const recordsProcessed = jobs.reduce((a: number, j: any) => a + (j.total_records || 0), 0);
  const recordsOk = jobs.reduce((a: number, j: any) => a + (j.success_count || 0), 0);
  const recordsFailed = jobs.reduce((a: number, j: any) => a + (j.failed_count || 0), 0);
  // 14-day series
  const days: Array<{ date: string; success: number; failed: number; total: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const mine = jobs.filter((j: any) => String(j.created_at || "").slice(0, 10) === key);
    days.push({ date: key.slice(5), success: mine.reduce((a: number, j: any) => a + (j.success_count || 0), 0), failed: mine.reduce((a: number, j: any) => a + (j.failed_count || 0), 0), total: mine.reduce((a: number, j: any) => a + (j.total_records || 0), 0) });
  }
  const byIntegration = integrations.map((im: any) => {
    const mine = jobs.filter((j: any) => j.integration_id === im.id);
    return { id: im.id, name: im.name, status: im.status, jobs: mine.length, success: mine.reduce((a: number, j: any) => a + (j.success_count || 0), 0), failed: mine.reduce((a: number, j: any) => a + (j.failed_count || 0), 0) };
  });
  const names = new Map(integrations.map((i: any) => [i.id, i.name]));
  const recentJobs = recent.slice(0, 8).map((j: any) => ({ ...j, integration_name: names.get(j.integration_id) || null }));
  const activity = await dbAll(`SELECT * FROM activity ORDER BY created_at DESC LIMIT 12`);
  res.json({
    totals: { integrations: integrations.length, healthy: integrations.filter((i: any) => i.status === "healthy").length, jobs: jobs.length, jobsOk: ok, jobsFailed: failed, recordsProcessed, recordsOk, recordsFailed, successRate: jobs.length ? Math.round((ok / jobs.length) * 100) : 100 },
    series: days,
    byIntegration,
    recentJobs,
    activity,
  });
}));

router.get("/activity", asyncHandler(async (req: any, res: any) => {
  const limit = Math.min(Number(req.query.limit || 30), 100);
  const rows = await dbAll(`SELECT * FROM activity ORDER BY created_at DESC LIMIT ${limit}`);
  res.json({ activity: rows });
}));

router.get("/notifications", asyncHandler(async (_req: any, res: any) => {
  const rows = await dbAll(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`);
  res.json({ notifications: rows.map((n: any) => ({ ...n, read: Boolean(n.read) })) });
}));

router.post("/notifications/:id/read", asyncHandler(async (req: any, res: any) => {
  await dbRun(`UPDATE notifications SET read = 1 WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
}));

router.post("/notifications/read-all", asyncHandler(async (_req: any, res: any) => {
  await dbRun(`UPDATE notifications SET read = 1`, []);
  res.json({ ok: true });
}));

export default router;
