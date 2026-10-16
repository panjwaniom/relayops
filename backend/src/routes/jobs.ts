import { Router } from "express";
import { randomUUID } from "crypto";
import { dbAll, dbGet, dbRun } from "../db";
import { asyncHandler, requireAuth } from "../auth";
import { enqueueJob } from "../queue";
import { analyzeJob } from "../ai";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req: any, res: any) => {
  const status = String(req.query.status || "");
  const q = String(req.query.q || "").toLowerCase();
  const integrationId = String(req.query.integrationId || "");
  let rows = await dbAll(`SELECT j.*, i.name as integration_name, i.type as integration_type FROM jobs j LEFT JOIN integrations i ON i.id = j.integration_id ORDER BY j.created_at DESC LIMIT 200`);
  if (status) rows = rows.filter((r: any) => r.status === status);
  if (integrationId) rows = rows.filter((r: any) => r.integration_id === integrationId);
  if (q) rows = rows.filter((r: any) => ((r.integration_name || "") + " " + r.id).toLowerCase().includes(q));
  res.json({ jobs: rows });
}));

router.get("/:id", asyncHandler(async (req: any, res: any) => {
  const job = await dbGet(`SELECT j.*, i.name as integration_name, i.type as integration_type FROM jobs j LEFT JOIN integrations i ON i.id = j.integration_id WHERE j.id = ?`, [req.params.id]);
  if (!job) return res.status(404).json({ error: "Not found" });
  const status = String(req.query.recordStatus || "");
  let records = await dbAll(`SELECT * FROM job_records WHERE job_id = ? ORDER BY row_index`, [job.id]);
  if (status) records = records.filter((r: any) => r.status === status);
  const logs = await dbAll(`SELECT * FROM job_logs WHERE job_id = ? ORDER BY created_at`, [job.id]);
  res.json({ job, records: records.map((r: any) => ({ ...r, input: JSON.parse(r.input_json || "null"), output: JSON.parse(r.output_json || "null") })), logs });
}));

router.post("/:id/retry", asyncHandler(async (req: any, res: any) => {
  const job = await dbGet(`SELECT * FROM jobs WHERE id = ?`, [req.params.id]);
  if (!job) return res.status(404).json({ error: "Not found" });
  if ((job.attempts || 0) >= 3) return res.status(400).json({ error: "Max retries (3) reached for this job" });
  const id = randomUUID();
  await dbRun(`INSERT INTO jobs (id, integration_id, status, trigger, total_records, created_at, attempts) VALUES (?, ?, 'queued', 'retry', 0, ?, 0)`, [id, job.integration_id, new Date().toISOString()]);
  await enqueueJob(id);
  res.status(201).json({ job: await dbGet(`SELECT * FROM jobs WHERE id = ?`, [id]) });
}));

router.post("/:id/analyze", asyncHandler(async (req: any, res: any) => {
  const analysis = await analyzeJob(req.params.id);
  res.json({ analysis });
}));

export default router;
