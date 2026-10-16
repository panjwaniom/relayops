import fs from "fs";
import path from "path";
import { config } from "./config";

export type DbMode = "sqlite" | "postgres";

let mode: DbMode = config.usePostgres ? "postgres" : "sqlite";
let sqlite: any = null;
let pgPool: any = null;

const DATA_DIR = path.join(__dirname, "..", "data");
const SQLITE_FILE = path.join(DATA_DIR, "relayops.db");

export function getMode(): DbMode {
  return mode;
}

async function pgQuery(text: string, params: any[] = []): Promise<{ rows: any[] }> {
  if (!pgPool) {
    const { Pool } = require("pg");
    // Hosted Postgres (Render, Neon) requires TLS; local containers typically don't.
    // rejectUnauthorized:false keeps self-signed/rotated certs working for a demo deploy.
    // servername (SNI) is required by some hosted proxies or they drop the connection.
    let servername: string | undefined;
    try { servername = new URL(config.databaseUrl).hostname || undefined; } catch {}
    pgPool = new Pool({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false, servername } });
    pgPool.on("error", (e: Error) => console.error("[db] pool error:", e.message));
  }
  return pgPool.query(text, params);
}

function sqliteDb(): any {
  if (!sqlite) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Node 22+ built-in SQLite (no native dependency)
    const { DatabaseSync } = require("node:sqlite");
    sqlite = new DatabaseSync(SQLITE_FILE);
    sqlite.exec("PRAGMA journal_mode = WAL;");
  }
  return sqlite;
}

// node:sqlite uses ? placeholders; emulate better-sqlite3 prepare API
function prep(text: string) {
  const db = sqliteDb();
  const stmt = db.prepare(text);
  return {
    all: (...p: any[]) => stmt.all(...p),
    get: (...p: any[]) => stmt.get(...p) ?? null,
    run: (...p: any[]) => stmt.run(...p),
  };
}

function toPg(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

export async function dbAll(text: string, params: any[] = []): Promise<any[]> {
  if (mode === "postgres") {
    const r = await pgQuery(toPg(text), params);
    return r.rows;
  }
  return prep(text).all(...params) as any[];
}

export async function dbGet(text: string, params: any[] = []): Promise<any> {
  if (mode === "postgres") {
    const r = await pgQuery(toPg(text), params);
    return r.rows[0] ?? null;
  }
  return prep(text).get(...params);
}

export async function dbRun(text: string, params: any[] = []): Promise<{ lastID?: any; changes: number }> {
  if (mode === "postgres") {
    const r = await pgQuery(toPg(text), params);
    const row = r.rows[0];
    return { lastID: row?.id, changes: r.rows.length || 0 };
  }
  const info: any = prep(text).run(...params);
  return { lastID: info?.lastInsertRowid, changes: Number(info?.changes ?? 0) };
}

export async function ensureSchema(): Promise<void> {
  const isPg = mode === "postgres";
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS integrations (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'healthy', endpoint TEXT, csv_text TEXT, method TEXT NOT NULL DEFAULT 'GET', auth_type TEXT NOT NULL DEFAULT 'none', auth_secret TEXT, data_path TEXT NOT NULL DEFAULT '', api_key_hint TEXT, schedule TEXT NOT NULL DEFAULT 'every_15m', next_run_at TEXT, owner TEXT, description TEXT, mapping TEXT NOT NULL DEFAULT '[]', transforms TEXT NOT NULL DEFAULT '[]', validations TEXT NOT NULL DEFAULT '[]', last_run_at TEXT, last_status TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, integration_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', trigger TEXT NOT NULL DEFAULT 'manual', total_records INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0, skipped_count INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, error_summary TEXT, started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS job_records (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, row_index INTEGER NOT NULL, status TEXT NOT NULL, source_hash TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT, error TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS job_logs (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info', message TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT, integration_id TEXT, job_id TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'info', read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS processed_hashes (hash TEXT PRIMARY KEY, integration_id TEXT NOT NULL, job_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
  ];
  for (const s of stmts) {
    if (isPg) await pgQuery(s);
    else sqliteDb().exec(s);
  }
  // later schema additions (safe on existing DBs)
  for (const s of [
    `ALTER TABLE integrations ADD COLUMN csv_text TEXT`,
    `ALTER TABLE integrations ADD COLUMN method TEXT NOT NULL DEFAULT 'GET'`,
    `ALTER TABLE integrations ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'none'`,
    `ALTER TABLE integrations ADD COLUMN auth_secret TEXT`,
    `ALTER TABLE integrations ADD COLUMN data_path TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE integrations ADD COLUMN next_run_at TEXT`,
  ]) {
    try {
      if (isPg) await pgQuery(s);
      else sqliteDb().exec(s);
    } catch {}
  }
  for (const s of stmts) {
    if (isPg) await pgQuery(s);
    else sqliteDb().exec(s);
  }
  for (const s of [
    `CREATE INDEX IF NOT EXISTS idx_jobs_integration ON jobs(integration_id)`,
    `CREATE INDEX IF NOT EXISTS idx_records_job ON job_records(job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_logs_job ON job_logs(job_id)`,
  ]) {
    try {
      if (isPg) await pgQuery(s);
      else sqliteDb().exec(s);
    } catch {}
  }
}
