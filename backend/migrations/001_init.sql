-- RelayOps initial schema (PostgreSQL + SQLite compatible)
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS integrations (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'healthy', endpoint TEXT, csv_text TEXT, method TEXT NOT NULL DEFAULT 'GET', auth_type TEXT NOT NULL DEFAULT 'none', auth_secret TEXT, data_path TEXT NOT NULL DEFAULT '', api_key_hint TEXT, schedule TEXT NOT NULL DEFAULT 'every_15m', next_run_at TEXT, owner TEXT, description TEXT, mapping TEXT NOT NULL DEFAULT '[]', transforms TEXT NOT NULL DEFAULT '[]', validations TEXT NOT NULL DEFAULT '[]', last_run_at TEXT, last_status TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
ALTER TABLE integrations ADD COLUMN csv_text TEXT;
ALTER TABLE integrations ADD COLUMN method TEXT NOT NULL DEFAULT 'GET';
ALTER TABLE integrations ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE integrations ADD COLUMN auth_secret TEXT;
ALTER TABLE integrations ADD COLUMN data_path TEXT NOT NULL DEFAULT '';
ALTER TABLE integrations ADD COLUMN next_run_at TEXT;
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, integration_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', trigger TEXT NOT NULL DEFAULT 'manual', total_records INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0, skipped_count INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, error_summary TEXT, started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS job_records (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, row_index INTEGER NOT NULL, status TEXT NOT NULL, source_hash TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT, error TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS job_logs (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info', message TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT, integration_id TEXT, job_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'info', read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS processed_hashes (hash TEXT PRIMARY KEY, integration_id TEXT NOT NULL, job_id TEXT NOT NULL, created_at TEXT NOT NULL);
