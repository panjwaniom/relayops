import { randomUUID } from "crypto";
import { config } from "./config";
import { dbAll, dbGet, dbRun } from "./db";
import { generateRestRows, parseCsv, processRows } from "./engine";

type JobHandler = (jobId: string) => Promise<void>;

let useBull = false;
let bullQueue: any = null;
let bullWorker: any = null;

async function initBull(handler: JobHandler) {
  if (!config.useRedis) return false;
  try {
    const { Queue, Worker } = require("bullmq");
    const IORedis = require("ioredis");
    const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
    bullQueue = new Queue("relayops-sync", { connection });
    bullWorker = new Worker("relayops-sync", async (job: any) => handler(job.data.jobId), { connection });
    useBull = true;
    console.log("[queue] BullMQ + Redis enabled");
    return true;
  } catch (e) {
    console.warn("[queue] Redis unavailable, using in-process queue:", (e as Error).message);
    return false;
  }
}

// In-process fallback queue with retry + backoff
const pending = new Set<string>();
let handlerRef: JobHandler | null = null;

async function runSoon(jobId: string, attempt: number) {
  const delay = Math.min(1500 * Math.pow(2, attempt), 8000);
  setTimeout(async () => {
    if (!handlerRef) return;
    try {
      await handlerRef(jobId);
    } catch (e) {
      console.error("[queue] job failed", jobId, e);
    } finally {
      pending.delete(jobId);
    }
  }, jobId ? delay : 0);
}

export async function initQueue(handler: JobHandler): Promise<void> {
  handlerRef = handler;
  const ok = await initBull(handler);
  if (!ok) console.log("[queue] in-process background runner enabled (set REDIS_URL for BullMQ)");
}

export async function enqueueJob(jobId: string): Promise<void> {
  if (useBull && bullQueue) {
    await bullQueue.add("sync", { jobId }, { attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 50 });
    return;
  }
  if (pending.has(jobId)) return;
  pending.add(jobId);
  runSoon(jobId, 0);
}

export async function executeSyncJob(jobId: string): Promise<void> {
  const started = Date.now();
  const job = await dbGet(`SELECT * FROM jobs WHERE id = ?`, [jobId]);
  if (!job) return;
  const integration = await dbGet(`SELECT * FROM integrations WHERE id = ?`, [job.integration_id]);
  if (!integration) {
    await dbRun(`UPDATE jobs SET status = ?, finished_at = ?, error_summary = ? WHERE id = ?`, ["failed", new Date().toISOString(), "Integration not found", jobId]);
    return;
  }
  const attempts = (job.attempts || 0) + 1;
  await dbRun(`UPDATE jobs SET status = ?, started_at = ?, attempts = ? WHERE id = ?`, ["running", new Date().toISOString(), attempts, jobId]);
  await addLog(jobId, "info", `Job started (attempt ${attempts}, trigger: ${job.trigger})`);

  try {
    const mappings = JSON.parse(integration.mapping || "[]");
    const transforms = JSON.parse(integration.transforms || "[]");
    const validations = JSON.parse(integration.validations || "[]");
    let rows: Record<string, any>[] = [];
    let sourceNote = "";
    if (integration.type === "csv") {
      const csvText = integration.csv_text || (global as any).__csvStore?.[integration.id] || sampleCsv();
      const { parseCsv: pc } = await import("./engine");
      rows = pc(csvText);
      sourceNote = `CSV source (${rows.length} rows)`;
    } else if (/^https?:\/\//i.test(integration.endpoint || "")) {
      const { fetchJsonSource, extractRows, buildSourceHeaders } = await import("./http");
      await addLog(jobId, "info", `Fetching live data: ${integration.method || "GET"} ${integration.endpoint}`);
      const fetched = await fetchJsonSource(integration.endpoint, {
        method: integration.method || "GET",
        headers: buildSourceHeaders(integration.endpoint, integration),
      });
      await addLog(jobId, fetched.ok ? "info" : "error", fetched.ok ? `HTTP ${fetched.status} in ${fetched.latencyMs}ms` : `Fetch failed: ${fetched.error}`);
      if (!fetched.ok) {
        await dbRun(`UPDATE jobs SET status = ?, finished_at = ?, error_summary = ? WHERE id = ?`, ["failed", new Date().toISOString(), `Source fetch failed: ${fetched.error}`, jobId]);
        await dbRun(`UPDATE integrations SET last_run_at = ?, last_status = ? WHERE id = ?`, [new Date().toISOString(), "failed", integration.id]);
        await dbRun(`INSERT INTO notifications (id, title, body, severity, created_at) VALUES (?, ?, ?, 'error', ?)`, [randomUUID(), `Sync failed — ${integration.name}`, `Could not fetch source data: ${fetched.error}`, new Date().toISOString()]);
        return;
      }
      const extracted = extractRows(fetched.data, integration.data_path || "");
      if (extracted.error && extracted.rows.length === 0) {
        await addLog(jobId, "error", extracted.error);
        await dbRun(`UPDATE jobs SET status = ?, finished_at = ?, error_summary = ? WHERE id = ?`, ["failed", new Date().toISOString(), extracted.error, jobId]);
        return;
      }
      rows = extracted.rows;
      const { resolveRow } = await import("./http");
      rows = rows.map(resolveRow);
      sourceNote = `live API (${rows.length} rows)`;
    } else {
      rows = generateRestRows(integration.endpoint || integration.id, 140);
      sourceNote = "demo generator (no endpoint configured)";
    }
    const known = new Set<string>((await dbAll(`SELECT hash FROM processed_hashes WHERE integration_id = ?`, [integration.id])).map((r: any) => r.hash));
    await addLog(jobId, "info", `Source ready: ${sourceNote}`);
    const result = processRows(rows, { mappings, transforms, validations, knownHashes: known, maxRecords: 300 });

    // persist hashes + records + logs
    const now = new Date().toISOString();
    for (const h of known) {
      // best-effort insert (ignore conflicts)
      try {
        await dbRun(`INSERT INTO processed_hashes (hash, integration_id, job_id, created_at) VALUES (?, ?, ?, ?)`, [h, integration.id, jobId, now]);
      } catch {}
    }
    for (const r of result.records) {
      await dbRun(
        `INSERT INTO job_records (id, job_id, row_index, status, source_hash, input_json, output_json, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), jobId, r.index, r.status, r.hash, JSON.stringify(r.input), JSON.stringify(r.output), r.error, now]
      );
    }
    for (const l of result.logs) await addLog(jobId, l.level, l.message);

    const status = result.failed > 0 && result.success === 0 ? "failed" : result.failed > 0 ? "partial" : "success";
    const duration = Date.now() - started;
    await dbRun(
      `UPDATE jobs SET status = ?, total_records = ?, success_count = ?, failed_count = ?, skipped_count = ?, duration_ms = ?, finished_at = ?, error_summary = ? WHERE id = ?`,
      [status, result.total, result.success, result.failed, result.skipped, duration, new Date().toISOString(), result.failed ? `${result.failed} records failed validation` : null, jobId]
    );
    await dbRun(`UPDATE integrations SET last_run_at = ?, last_status = ? WHERE id = ?`, [new Date().toISOString(), status, integration.id]);
    await addLog(jobId, status === "success" ? "info" : "warn", `Job ${status} in ${duration}ms`);
    await dbRun(`INSERT INTO activity (id, kind, title, detail, integration_id, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      randomUUID(), "job", `Sync ${status}: ${integration.name}`, `${result.success} ok · ${result.failed} failed · ${result.skipped} skipped`, integration.id, jobId, new Date().toISOString(),
    ]);
    const failedInt = await dbGet(`SELECT * FROM integrations WHERE id = ?`, [integration.id]);
    if (status !== "success") {
      await dbRun(`UPDATE integrations SET status = ? WHERE id = ?`, ["degraded", integration.id]);
      await dbRun(`INSERT INTO notifications (id, title, body, severity, created_at) VALUES (?, ?, ?, ?, ?)`, [
        randomUUID(), `Sync ${status} — ${integration.name}`, `${result.failed} records failed. Open the job for details and AI diagnosis.`, status === "failed" ? "error" : "warning", new Date().toISOString(),
      ]);
    } else if (failedInt && failedInt.status !== "healthy") {
      await dbRun(`UPDATE integrations SET status = ? WHERE id = ?`, ["healthy", integration.id]);
    }
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    await dbRun(`UPDATE jobs SET status = ?, finished_at = ?, error_summary = ? WHERE id = ?`, ["failed", new Date().toISOString(), msg, jobId]);
    await addLog(jobId, "error", `Job crashed: ${msg}`);
    if (attempts < 3) {
      await addLog(jobId, "info", `Scheduling retry (attempt ${attempts + 1}) with backoff`);
      const j = await dbGet(`SELECT * FROM jobs WHERE id = ?`, [jobId]);
      // create a retry job linked to same integration
      const retryId = randomUUID();
      await dbRun(`INSERT INTO jobs (id, integration_id, status, trigger, total_records, created_at, attempts) VALUES (?, ?, 'queued', 'retry', 0, ?, 0)`, [retryId, j.integration_id, new Date().toISOString()]);
      await enqueueJob(retryId);
    }
  }
}

async function addLog(jobId: string, level: string, message: string) {
  await dbRun(`INSERT INTO job_logs (id, job_id, level, message, created_at) VALUES (?, ?, ?, ?, ?)`, [randomUUID(), jobId, level, message, new Date().toISOString()]);
}

export function sampleCsv(): string {
  return `full_name,email,plan,status,mrr,created
Ava Sharma,ava.sharma11@example.com,growth,active,420,2024-02-11
Liam Garcia,liam.garcia22@example,bad-plan,active,not-a-number,2024-03-01
Maya Kim,,scale,trialing,800,2024-01-19
Noah Patel,noah.patel44@example.com,enterprise,churned,3200,2024-05-30
Priya Nguyen,priya.nguyen55@example.com,growth,past_due,640,2024-04-02`;
}

export function storeCsv(integrationId: string, text: string) {
  (global as any).__csvStore = (global as any).__csvStore || {};
  (global as any).__csvStore[integrationId] = text;
  void parseCsv;
}
