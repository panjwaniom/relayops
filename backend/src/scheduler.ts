import { randomUUID } from "crypto";
import { dbAll, dbRun } from "./db";
import { enqueueJob } from "./queue";

export const SCHEDULE_INTERVALS: Record<string, number> = {
  manual: 0,
  every_5m: 5 * 60 * 1000,
  every_15m: 15 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

export function computeNextRun(schedule: string, from = Date.now()): string | null {
  const ms = SCHEDULE_INTERVALS[schedule] ?? 0;
  if (!ms) return null;
  return new Date(from + ms).toISOString();
}

/** One scheduler pass: enqueue jobs for due integrations. Returns ids enqueued. */
export async function schedulerTick(now = Date.now()): Promise<string[]> {
  const integrations = await dbAll(`SELECT * FROM integrations WHERE schedule != 'manual'`);
  const enqueued: string[] = [];
  for (const it of integrations) {
    if (it.next_run_at && new Date(it.next_run_at).getTime() > now) continue;
    // skip if a job is already queued/running for this integration (no overlapping runs)
    const active = await dbAll(
      `SELECT id FROM jobs WHERE integration_id = ? AND status IN ('queued','running') LIMIT 1`,
      [it.id]
    );
    if (active.length > 0) {
      await dbRun(`UPDATE integrations SET next_run_at = ? WHERE id = ?`, [computeNextRun(it.schedule, now), it.id]);
      continue;
    }
    const id = randomUUID();
    await dbRun(`INSERT INTO jobs (id, integration_id, status, trigger, total_records, created_at, attempts) VALUES (?, ?, 'queued', 'scheduled', 0, ?, 0)`, [
      id, it.id, new Date(now).toISOString(),
    ]);
    await dbRun(`UPDATE integrations SET next_run_at = ? WHERE id = ?`, [computeNextRun(it.schedule, now), it.id]);
    await enqueueJob(id);
    enqueued.push(id);
  }
  return enqueued;
}

let timer: NodeJS.Timeout | null = null;

export function startScheduler(intervalMs = 30000): void {
  if (timer) return;
  console.log("[scheduler] enabled (every 30s)");
  const run = () => schedulerTick().catch((e) => console.error("[scheduler]", e.message));
  run();
  timer = setInterval(run, intervalMs);
  timer.unref?.();
}
