import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { dbAll, dbGet, dbRun } from "../db";
import { asyncHandler, requireAuth } from "../auth";
import { mappingSchema, transformSchema, validationSchema, generateRestRows, parseCsv, applyMappingAndTransforms } from "../engine";
import { fetchJsonSource, extractRows, flattenKeys, buildSourceHeaders, maskSecret } from "../http";
import { computeNextRun } from "../scheduler";
import { enqueueJob, storeCsv } from "../queue";

const router = Router();
router.use(requireAuth);

/** Strip secrets from integration rows before sending to clients. */
export function publicIntegration(row: any): any {
  const { auth_secret, ...rest } = row;
  return { ...rest, has_secret: Boolean(auth_secret), secret_hint: maskSecret(auth_secret) };
}

const integrationSchema = z.object({
  name: z.string().min(2).max(80),
  type: z.enum(["rest", "csv"]),
  endpoint: z.string().max(500).optional().default(""),
  method: z.enum(["GET", "POST"]).default("GET"),
  auth_type: z.enum(["none", "bearer", "api_key", "basic"]).default("none"),
  auth_secret: z.string().max(500).optional().default(""),
  data_path: z.string().max(200).optional().default(""),
  schedule: z.enum(["manual", "every_5m", "every_15m", "hourly", "daily"]).default("every_15m"),
  description: z.string().max(500).optional().default(""),
  mapping: z.array(mappingSchema).default([]),
  transforms: z.array(transformSchema).default([]),
  validations: z.array(validationSchema).default([]),
  csvText: z.string().optional().default(""),
});

router.get("/", asyncHandler(async (req: any, res: any) => {
  const q = String(req.query.q || "").toLowerCase();
  const status = String(req.query.status || "");
  let rows = await dbAll(`SELECT * FROM integrations ORDER BY created_at DESC`);
  if (q) rows = rows.filter((r: any) => (r.name + " " + (r.endpoint || "")).toLowerCase().includes(q));
  if (status) rows = rows.filter((r: any) => r.status === status);
  // attach job stats
  const jobs = await dbAll(`SELECT * FROM jobs ORDER BY created_at DESC`);
  const out = rows.map((i: any) => {
    const mine = jobs.filter((j: any) => j.integration_id === i.id);
    return {
      ...publicIntegration(i),
      mapping: JSON.parse(i.mapping || "[]"),
      transforms: JSON.parse(i.transforms || "[]"),
      validations: JSON.parse(i.validations || "[]"),
      jobCount: mine.length,
      successRate: mine.length ? Math.round((mine.filter((j: any) => j.status === "success").length / mine.length) * 100) : null,
      lastJob: mine[0] || null,
    };
  });
  res.json({ integrations: out });
}));

router.post("/", asyncHandler(async (req: any, res: any) => {
  const body = integrationSchema.parse(req.body);
  if (body.type === "rest" && body.endpoint && !/^https?:\/\//i.test(body.endpoint)) {
    return res.status(400).json({ error: "Endpoint must start with http:// or https://" });
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO integrations (id, name, type, status, endpoint, csv_text, method, auth_type, auth_secret, data_path, schedule, next_run_at, description, mapping, transforms, validations, created_at, updated_at) VALUES (?, ?, ?, 'healthy', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, body.name, body.type, body.endpoint, body.type === "csv" ? body.csvText : null, body.method, body.auth_type, body.auth_secret || null, body.data_path, body.schedule, computeNextRun(body.schedule), body.description, JSON.stringify(body.mapping), JSON.stringify(body.transforms), JSON.stringify(body.validations), now, now]
  );
  if (body.type === "csv" && body.csvText) storeCsv(id, body.csvText);
  await dbRun(`INSERT INTO activity (id, kind, title, detail, integration_id, created_at) VALUES (?, 'integration', ?, ?, ?, ?)`, [randomUUID(), `Integration created: ${body.name}`, `${body.type} · ${body.schedule}`, id, now]);
  const row = await dbGet(`SELECT * FROM integrations WHERE id = ?`, [id]);
  res.status(201).json({ integration: publicIntegration(row) });
}));

router.get("/:id", asyncHandler(async (req: any, res: any) => {
  const row = await dbGet(`SELECT * FROM integrations WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const jobs = await dbAll(`SELECT * FROM jobs WHERE integration_id = ? ORDER BY created_at DESC LIMIT 20`, [row.id]);
  res.json({
    integration: { ...publicIntegration(row), mapping: JSON.parse(row.mapping || "[]"), transforms: JSON.parse(row.transforms || "[]"), validations: JSON.parse(row.validations || "[]") },
    jobs,
  });
}));

router.put("/:id", asyncHandler(async (req: any, res: any) => {
  const body = integrationSchema.partial().parse(req.body);
  const row = await dbGet(`SELECT * FROM integrations WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const next = {
    name: body.name ?? row.name,
    type: body.type ?? row.type,
    endpoint: body.endpoint ?? row.endpoint,
    method: (body as any).method ?? row.method ?? "GET",
    auth_type: (body as any).auth_type ?? row.auth_type ?? "none",
    // empty secret = keep existing; never blank an existing secret unintentionally
    auth_secret: (body as any).auth_secret ? (body as any).auth_secret : row.auth_secret,
    data_path: (body as any).data_path ?? row.data_path ?? "",
    schedule: body.schedule ?? row.schedule,
    description: body.description ?? row.description,
    mapping: body.mapping ? JSON.stringify(body.mapping) : row.mapping,
    transforms: body.transforms ? JSON.stringify(body.transforms) : row.transforms,
    validations: body.validations ? JSON.stringify(body.validations) : row.validations,
  };
  if (next.type === "rest" && next.endpoint && !/^https?:\/\//i.test(next.endpoint)) {
    return res.status(400).json({ error: "Endpoint must start with http:// or https://" });
  }
  const nextRun = body.schedule && body.schedule !== row.schedule ? computeNextRun(body.schedule) : row.next_run_at;
  await dbRun(`UPDATE integrations SET name=?, type=?, endpoint=?, csv_text=?, method=?, auth_type=?, auth_secret=?, data_path=?, schedule=?, next_run_at=?, description=?, mapping=?, transforms=?, validations=?, updated_at=? WHERE id=?`,
    [next.name, next.type, next.endpoint, body.csvText ?? row.csv_text ?? null, next.method, next.auth_type, next.auth_secret, next.data_path, next.schedule, nextRun, next.description, next.mapping, next.transforms, next.validations, new Date().toISOString(), row.id]);
  if (body.csvText) storeCsv(row.id, body.csvText);
  const updated = await dbGet(`SELECT * FROM integrations WHERE id = ?`, [row.id]);
  res.json({ integration: publicIntegration(updated) });
}));

router.delete("/:id", asyncHandler(async (req: any, res: any) => {
  await dbRun(`DELETE FROM job_records WHERE job_id IN (SELECT id FROM jobs WHERE integration_id = ?)`, [req.params.id]);
  await dbRun(`DELETE FROM job_logs WHERE job_id IN (SELECT id FROM jobs WHERE integration_id = ?)`, [req.params.id]);
  await dbRun(`DELETE FROM jobs WHERE integration_id = ?`, [req.params.id]);
  await dbRun(`DELETE FROM processed_hashes WHERE integration_id = ?`, [req.params.id]);
  await dbRun(`DELETE FROM integrations WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
}));

router.post("/:id/run", asyncHandler(async (req: any, res: any) => {
  const row = await dbGet(`SELECT * FROM integrations WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const id = randomUUID();
  await dbRun(`INSERT INTO jobs (id, integration_id, status, trigger, total_records, created_at, attempts) VALUES (?, ?, 'queued', 'manual', 0, ?, 0)`, [id, row.id, new Date().toISOString()]);
  await enqueueJob(id);
  const job = await dbGet(`SELECT * FROM jobs WHERE id = ?`, [id]);
  res.status(201).json({ job });
}));

router.post("/:id/test", asyncHandler(async (req: any, res: any) => {
  const row = await dbGet(`SELECT * FROM integrations WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  // allow testing a candidate endpoint/auth before saving
  const schema = z.object({
    endpoint: z.string().optional(), method: z.enum(["GET", "POST"]).optional(),
    auth_type: z.enum(["none", "bearer", "api_key", "basic"]).optional(),
    auth_secret: z.string().optional(), data_path: z.string().optional(),
  });
  const cand = schema.parse(req.body || {});
  const endpoint = cand.endpoint ?? row.endpoint;
  if (row.type === "csv" && !cand.endpoint) {
    const csvText = row.csv_text || "";
    const n = csvText ? parseCsv(csvText).length : 0;
    return res.json({ ok: true, latencyMs: 5, message: `CSV source ready (${n} rows staged)`, rowCount: n, live: false });
  }
  const fetched = await fetchJsonSource(endpoint || "", {
    method: cand.method ?? row.method ?? "GET",
    headers: buildSourceHeaders(endpoint || "", { auth_type: cand.auth_type ?? row.auth_type, auth_secret: cand.auth_secret || row.auth_secret }),
  });
  if (!fetched.ok) return res.status(400).json({ ok: false, error: fetched.error, status: fetched.status, latencyMs: fetched.latencyMs });
  const extracted = extractRows(fetched.data, cand.data_path ?? row.data_path ?? "");
  if (extracted.error && extracted.rows.length === 0) {
    return res.status(400).json({ ok: false, error: extracted.error, status: fetched.status, latencyMs: fetched.latencyMs });
  }
  res.json({ ok: true, latencyMs: fetched.latencyMs, status: fetched.status, message: `Connected — ${extracted.rows.length} records available`, rowCount: extracted.rows.length, fields: flattenKeys(extracted.rows[0] || {}).slice(0, 30), live: true });
}));

router.post("/:id/preview", asyncHandler(async (req: any, res: any) => {
  const row = await dbGet(`SELECT * FROM integrations WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const schema = z.object({ mapping: z.array(mappingSchema).optional(), transforms: z.array(transformSchema).optional(), validations: z.array(validationSchema).optional(), limit: z.number().optional(), data_path: z.string().optional() });
  const body = schema.parse(req.body || {});
  const mappings = body.mapping ?? JSON.parse(row.mapping || "[]");
  const transforms = body.transforms ?? JSON.parse(row.transforms || "[]");
  let rows: Record<string, any>[];
  let live = false;
  let fetchInfo: any = null;
  if (row.type === "csv") {
    rows = parseCsv((row.csv_text || (global as any).__csvStore?.[row.id]) || "full_name,email,plan\nAva,ava@example.com,growth");
  } else if (/^https?:\/\//i.test(row.endpoint || "")) {
    const fetched = await fetchJsonSource(row.endpoint, { method: row.method || "GET", headers: buildSourceHeaders(row.endpoint, row) });
    if (!fetched.ok) return res.status(400).json({ error: `Live fetch failed: ${fetched.error}`, status: fetched.status });
    const extracted = extractRows(fetched.data, body.data_path ?? row.data_path ?? "");
    if (extracted.error && extracted.rows.length === 0) return res.status(400).json({ error: extracted.error });
    rows = extracted.rows;
    live = true;
    fetchInfo = { status: fetched.status, latencyMs: fetched.latencyMs, rowCount: rows.length };
  } else {
    rows = generateRestRows(row.endpoint || row.id, 20);
  }
  if (rows.length === 0) return res.status(400).json({ error: "Source returned no rows" });
  const { resolveRow } = await import("../http");
  const resolved = rows.map(resolveRow);
  const preview = resolved.slice(0, body.limit ?? 8).map((input) => ({ input, output: applyMappingAndTransforms(input, mappings, transforms) }));
  res.json({ preview, sourceFields: flattenKeys(resolved[0] || {}), live, fetch: fetchInfo });
}));

export default router;
