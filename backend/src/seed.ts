import { randomUUID } from "crypto";
import { ensureSchema, dbAll, dbGet, dbRun } from "./db";
import { hashPassword } from "./auth";
import { generateRestRows, processRows } from "./engine";
import { resolveRow } from "./http";
import { storeCsv } from "./queue";

/** Realistic JSONPlaceholder-shaped rows (name/email/phone + nested address/company). */
function jsonPlaceholderSample(n: number): Record<string, any>[] {
  const base = generateRestRows("jsonplaceholder-seed", n);
  const cities = ["Gwenborough", "Wisokyburgh", "McKenziehaven", "South Elvis", "Roscoeview", "Howemouth"];
  const companies = ["Romaguera-Crona", "Deckow-Crist", "Romaguera-Jacobson", "Robel-Corkery", "Keebler LLC", "Considine-Lockman"];
  return base.map((r, i) => ({
    id: i + 1,
    name: r.full_name,
    username: String(r.full_name).split(" ")[0] + (i + 1),
    email: r.email,
    phone: `1-770-736-8031 x${1000 + i}`,
    website: `${String(r.full_name).split(" ")[0].toLowerCase()}.org`,
    address: { street: "Kulas Light", suite: `Apt. ${100 + i}`, city: cities[i % cities.length], zipcode: "92998-3874" },
    company: { name: companies[i % companies.length], catchPhrase: "Multi-layered client-server neural-net" },
  }));
}

const INTEGRATIONS = [
  { name: "Stripe Customers", type: "rest", endpoint: "", schedule: "every_15m", description: "Simulated Stripe-like customer feed (demo data — attach a real endpoint to go live).", mapping: [{ source: "full_name", target: "name", required: true }, { source: "email", target: "email", required: true }, { source: "plan", target: "plan" }, { source: "mrr", target: "mrr" }, { source: "status", target: "status" }], transforms: [{ field: "email", op: "trim" }, { field: "email", op: "lowercase" }, { field: "name", op: "trim" }, { field: "mrr", op: "to_number" }], validations: [{ field: "email", rule: "required" }, { field: "email", rule: "email" }, { field: "name", rule: "required" }, { field: "mrr", rule: "number" }, { field: "email", rule: "unique" }] },
  { name: "Shopify Orders", type: "rest", endpoint: "", schedule: "every_5m", description: "Simulated high-frequency order feed (demo data).", mapping: [{ source: "full_name", target: "customer" }, { source: "email", target: "email" }, { source: "plan", target: "tier" }, { source: "mrr", target: "amount" }], transforms: [{ field: "email", op: "lowercase" }, { field: "amount", op: "to_number" }], validations: [{ field: "amount", rule: "number" }] },
  { name: "Salesforce Contacts CSV", type: "csv", endpoint: "", schedule: "daily", description: "Weekly SDR contact import. CSV uploaded by RevOps.", mapping: [{ source: "full_name", target: "name" }, { source: "email", target: "email" }, { source: "plan", target: "segment" }], transforms: [{ field: "email", op: "trim" }, { field: "email", op: "lowercase" }], validations: [{ field: "email", rule: "required" }, { field: "email", rule: "email" }, { field: "email", rule: "unique" }] },
  { name: "HubSpot Companies", type: "rest", endpoint: "", schedule: "hourly", description: "Simulated company enrichment feed (demo data).", mapping: [{ source: "full_name", target: "contact" }, { source: "email", target: "email" }, { source: "status", target: "lifecycle" }], transforms: [{ field: "email", op: "lowercase" }], validations: [{ field: "contact", rule: "required" }] },
  { name: "Legacy Warehouse Export", type: "csv", endpoint: "", schedule: "manual", description: "One-off migration backlog with messy historical rows.", mapping: [{ source: "full_name", target: "name" }, { source: "email", target: "email" }, { source: "mrr", target: "mrr" }], transforms: [{ field: "mrr", op: "to_number" }], validations: [{ field: "email", rule: "required" }, { field: "mrr", rule: "number" }] },
  { name: "JSONPlaceholder Users", type: "rest", endpoint: "https://jsonplaceholder.typicode.com/users", schedule: "hourly", description: "Live public API demo — real HTTP fetch, no key required.", mapping: [{ source: "name", target: "name", required: true }, { source: "email", target: "email", required: true }, { source: "phone", target: "phone" }, { source: "address.city", target: "city" }, { source: "company.name", target: "company" }], transforms: [{ field: "email", op: "trim" }, { field: "email", op: "lowercase" }, { field: "name", op: "trim" }], validations: [{ field: "email", rule: "required" }, { field: "email", rule: "email" }, { field: "name", rule: "required" }] },
];

const CSV_SAMPLE = `full_name,email,plan,status,mrr,created
Ava Sharma,ava.sharma11@example.com,growth,active,420,2024-02-11
Liam Garcia,liam.garcia22@example,bad-plan,active,not-a-number,2024-03-01
Maya Kim,,scale,trialing,800,2024-01-19
Noah Patel,noah.patel44@example.com,enterprise,churned,3200,2024-05-30
Priya Nguyen,priya.nguyen55@example.com,growth,past_due,640,2024-04-02
Chen Silva,chen.silva@example,starter,active,120,2024-06-11
Sofia Khan,sofia.khan@example.com,scale,active,1400,2024-02-28
Marcus Muller,marcus.muller@example.com,growth,active,540,2024-03-15
Elena Rossi,elena.rossi@example.com,starter,trialing,90,2024-07-01
Raj Patel,raj.patel@example.com,enterprise,active,4100,2024-01-05`;

async function main() {
  await ensureSchema();
  const existing = await dbAll(`SELECT id FROM users LIMIT 1`);
  const allowDemoSeed = process.env.NODE_ENV !== "production" || process.env.SEED_DEMO === "true";
  if (existing.length === 0 && allowDemoSeed) {
    await dbRun(`INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)`, [
      randomUUID(), "Demo Admin", "admin@relayops.io", await hashPassword("password123"), new Date().toISOString(),
    ]);
    console.log("seed user: admin@relayops.io / password123");
  }
  const ints = await dbAll(`SELECT id FROM integrations LIMIT 1`);
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO !== "true") {
    console.log("production mode: skipping demo seed (set SEED_DEMO=true to include demo data)");
    process.exit(0);
  }
  if (ints.length > 0) {
    console.log("integrations already seeded, skipping");
    process.exit(0);
  }
  const knownGlobal = new Set<string>();
  for (const def of INTEGRATIONS) {
    const id = randomUUID();
    const now = new Date().toISOString();
    await dbRun(`INSERT INTO integrations (id, name, type, status, endpoint, csv_text, method, auth_type, auth_secret, data_path, schedule, next_run_at, description, mapping, transforms, validations, created_at, updated_at) VALUES (?, ?, ?, 'healthy', ?, ?, 'GET', 'none', NULL, '', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, def.name, def.type, def.endpoint, def.type === "csv" ? CSV_SAMPLE : null, def.schedule, def.schedule === "manual" ? null : new Date(Date.now() + 3600000).toISOString(), def.description, JSON.stringify(def.mapping), JSON.stringify(def.transforms), JSON.stringify(def.validations), now, now]);
    if (def.type === "csv") storeCsv(id, CSV_SAMPLE);
    // create 6 historical jobs per integration over last 14 days
    for (let k = 5; k >= 0; k--) {
      const jobId = randomUUID();
      const created = new Date(Date.now() - k * 2 * 86400000 - Math.floor(Math.random() * 80000000)).toISOString();
      const rows = def.type === "csv"
        ? (await import("./engine")).parseCsv(CSV_SAMPLE)
        : /jsonplaceholder/i.test(def.endpoint || "")
          ? jsonPlaceholderSample(40 + Math.floor(Math.random() * 20))
          : generateRestRows(def.endpoint || id, 60 + Math.floor(Math.random() * 80));
      const known = new Set<string>([...knownGlobal].slice(0, 20));
      const result = processRows(rows.map(resolveRow), { mappings: def.mapping as any, transforms: def.transforms as any, validations: def.validations as any, knownHashes: known, maxRecords: 120 });
      for (const h of known) { try { await dbRun(`INSERT INTO processed_hashes (hash, integration_id, job_id, created_at) VALUES (?, ?, ?, ?)`, [h, id, jobId, created]); } catch {} }
      const status = result.failed > 0 && result.success === 0 ? "failed" : result.failed > 0 ? "partial" : "success";
      const duration = 800 + Math.floor(Math.random() * 4000);
      await dbRun(`INSERT INTO jobs (id, integration_id, status, trigger, total_records, success_count, failed_count, skipped_count, duration_ms, error_summary, started_at, finished_at, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [jobId, id, status, k === 0 ? "manual" : "scheduled", result.total, result.success, result.failed, result.skipped, duration, result.failed ? `${result.failed} records failed validation` : null, created, created, created]);
      for (const r of result.records.slice(0, 120)) {
        await dbRun(`INSERT INTO job_records (id, job_id, row_index, status, source_hash, input_json, output_json, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), jobId, r.index, r.status, r.hash, JSON.stringify(r.input), JSON.stringify(r.output), r.error, created]);
      }
      await dbRun(`INSERT INTO job_logs (id, job_id, level, message, created_at) VALUES (?, ?, 'info', ?, ?)`, [randomUUID(), jobId, `Scheduled sync finished: ${result.success} ok, ${result.failed} failed`, created]);
      if (status !== "success") await dbRun(`INSERT INTO job_logs (id, job_id, level, message, created_at) VALUES (?, ?, 'warn', ?, ?)`, [randomUUID(), jobId, `${result.failed} rows failed validation`, created]);
      for (const h of known) knownGlobal.add(h);
    }
    const lastStatus = (await dbGet(`SELECT status FROM jobs WHERE integration_id = ? ORDER BY created_at DESC LIMIT 1`, [id]))?.status || "success";
    await dbRun(`UPDATE integrations SET last_run_at = ?, last_status = ?, status = ? WHERE id = ?`, [new Date().toISOString(), lastStatus, lastStatus === "success" ? "healthy" : "degraded", id]);
  }
  const now = new Date().toISOString();
  const notifs: Array<[string, string, string]> = [
    ["Sync partial — Stripe Customers", "12 records failed email validation. AI diagnosis available.", "warning"],
    ["Sync failed — Legacy Warehouse Export", "Historical rows missing required emails. Review mapping defaults.", "error"],
    ["New integration connected", "HubSpot Companies finished its first successful sync.", "info"],
  ];
  for (const [t, b, s] of notifs) await dbRun(`INSERT INTO notifications (id, title, body, severity, created_at) VALUES (?, ?, ?, ?, ?)`, [randomUUID(), t, b, s, now]);
  const acts: Array<[string, string]> = [
    ["Scheduled sync completed for Shopify Orders", "118 ok · 9 failed · 4 skipped"],
    ["AI diagnosis requested for Legacy Warehouse Export", "Duplicate + type-coercion root causes found"],
    ["CSV uploaded to Salesforce Contacts", "10 rows staged for preview"],
  ];
  for (const [t, d] of acts) await dbRun(`INSERT INTO activity (id, kind, title, detail, created_at) VALUES (?, 'system', ?, ?, ?)`, [randomUUID(), t, d, now]);
  console.log("seed complete");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
