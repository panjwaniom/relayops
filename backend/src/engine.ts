import crypto from "crypto";
import { z } from "zod";

export const mappingSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  required: z.boolean().optional().default(false),
});
export const transformSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["trim", "lowercase", "uppercase", "to_number", "to_date", "default", "strip_html"]),
  arg: z.string().optional().default(""),
});
export const validationSchema = z.object({
  field: z.string().min(1),
  rule: z.enum(["required", "email", "number", "min_length", "max_length", "range", "unique"]),
  arg: z.string().optional().default(""),
});

export type Mapping = z.input<typeof mappingSchema>;
export type Transform = z.input<typeof transformSchema>;
export type Validation = z.input<typeof validationSchema>;

export function sha1(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex");
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ""));
}

export function applyMappingAndTransforms(
  row: Record<string, any>,
  mappings: Mapping[],
  transforms: Transform[]
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const m of mappings) {
    out[m.target] = row[m.source] ?? null;
  }
  // if no mappings, pass through
  if (mappings.length === 0) Object.assign(out, row);
  for (const t of transforms) {
    let v = out[t.field];
    if (v === undefined || v === null) {
      if (t.op === "default") out[t.field] = t.arg;
      continue;
    }
    const s = String(v);
    switch (t.op) {
      case "trim": out[t.field] = s.trim(); break;
      case "lowercase": out[t.field] = s.toLowerCase(); break;
      case "uppercase": out[t.field] = s.toUpperCase(); break;
      case "to_number": {
        const n = Number(s.replace(/[^0-9.\-]/g, ""));
        out[t.field] = Number.isFinite(n) && s.trim() !== "" ? n : s;
        break;
      }
      case "to_date": {
        const d = new Date(s);
        out[t.field] = Number.isNaN(d.getTime()) ? s : d.toISOString();
        break;
      }
      case "strip_html": out[t.field] = s.replace(/<[^>]*>/g, ""); break;
      case "default": if (s.trim() === "") out[t.field] = t.arg; break;
    }
  }
  return out;
}

export function validateRecord(
  rec: Record<string, any>,
  validations: Validation[],
  seenUnique: Map<string, Set<string>>
): string | null {
  for (const v of validations) {
    const val = rec[v.field];
    const s = val === null || val === undefined ? "" : String(val);
    switch (v.rule) {
      case "required":
        if (s.trim() === "") return `${v.field} is required`;
        break;
      case "email":
        if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `${v.field} must be a valid email`;
        break;
      case "number":
        if (s !== "" && !Number.isFinite(Number(s))) return `${v.field} must be a number`;
        break;
      case "min_length":
        if (s.length < Number(v.arg || 0)) return `${v.field} must be at least ${v.arg} characters`;
        break;
      case "max_length":
        if (s.length > Number(v.arg || 999999)) return `${v.field} must be at most ${v.arg} characters`;
        break;
      case "range": {
        const [a, b] = String(v.arg || "").split(":").map(Number);
        const n = Number(s);
        if (!Number.isFinite(n) || n < a || n > b) return `${v.field} must be between ${a} and ${b}`;
        break;
      }
      case "unique": {
        const key = `u:${v.field}`;
        if (!seenUnique.has(key)) seenUnique.set(key, new Set());
        const set = seenUnique.get(key)!;
        if (s !== "" && set.has(s)) return `${v.field} must be unique (duplicate "${s}")`;
        set.add(s);
        break;
      }
    }
  }
  return null;
}

// Deterministic pseudo-random source generator for REST integrations (seeded demo data)
export function generateRestRows(endpoint: string, n = 120): Record<string, any>[] {
  const seed = [...endpoint].reduce((a, c) => a + c.charCodeAt(0), 7);
  const rnd = mulberry(seed);
  const first = ["Ava", "Liam", "Maya", "Noah", "Priya", "Chen", "Sofia", "Marcus", "Elena", "Raj", "Yuki", "Omar"];
  const last = ["Sharma", "Garcia", "Kim", "Patel", "Nguyen", "Silva", "Khan", "Muller", "Rossi", "Dubois", "Tanaka", "Ali"];
  const plans = ["starter", "growth", "scale", "enterprise"];
  const statuses = ["active", "active", "active", "trialing", "past_due", "churned"];
  const rows: Record<string, any>[] = [];
  for (let i = 0; i < n; i++) {
    const f = first[Math.floor(rnd() * first.length)];
    const l = last[Math.floor(rnd() * last.length)];
    const badEmail = rnd() < 0.06;
    const missing = rnd() < 0.05;
    const dup = i > 0 && rnd() < 0.04;
    const email = dup
      ? rows[Math.floor(rnd() * rows.length)].email
      : badEmail
        ? `${f.toLowerCase()}@${["", "bad", "nondomain"][Math.floor(rnd() * 3)]}`
        : `${f.toLowerCase()}.${l.toLowerCase()}${Math.floor(rnd() * 90 + 10)}@example.com`;
    rows.push({
      id: `ext_${seed}_${i}`,
      full_name: `${f} ${l}`,
      email: missing ? "" : email,
      plan: plans[Math.floor(rnd() * plans.length)],
      status: statuses[Math.floor(rnd() * statuses.length)],
      mrr: Math.floor(rnd() * 4000) + 20,
      created: new Date(Date.now() - Math.floor(rnd() * 300) * 86400000).toISOString(),
    });
  }
  return rows;
}

function mulberry(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ProcessResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  records: Array<{ index: number; status: "success" | "failed" | "skipped"; input: any; output: any; error: string | null; hash: string }>;
  logs: Array<{ level: string; message: string }>;
}

export function processRows(
  rows: Record<string, any>[],
  opts: { mappings: Mapping[]; transforms: Transform[]; validations: Validation[]; knownHashes: Set<string>; maxRecords?: number }
): ProcessResult {
  const seenUnique = new Map<string, Set<string>>();
  const records: ProcessResult["records"] = [];
  const logs: ProcessResult["logs"] = [];
  let success = 0, failed = 0, skipped = 0;
  const limit = opts.maxRecords ?? 500;
  const slice = rows.slice(0, limit);
  logs.push({ level: "info", message: `Fetched ${rows.length} source rows (processing ${slice.length})` });
  logs.push({ level: "info", message: `Applying ${opts.mappings.length} field mappings, ${opts.transforms.length} transforms, ${opts.validations.length} validations` });
  for (let i = 0; i < slice.length; i++) {
    const input = slice[i];
    const hash = sha1(JSON.stringify(input));
    if (opts.knownHashes.has(hash)) {
      skipped++;
      records.push({ index: i, status: "skipped", input, output: null, error: "duplicate: already synced", hash });
      continue;
    }
    const output = applyMappingAndTransforms(input, opts.mappings, opts.transforms);
    const err = validateRecord(output, opts.validations, seenUnique);
    if (err) {
      failed++;
      records.push({ index: i, status: "failed", input, output, error: err, hash });
    } else {
      success++;
      opts.knownHashes.add(hash);
      records.push({ index: i, status: "success", input, output, error: null, hash });
    }
  }
  logs.push({ level: "info", message: `Finished: ${success} succeeded, ${failed} failed, ${skipped} skipped (duplicates)` });
  if (failed > 0) logs.push({ level: "warn", message: `${failed} records failed validation — see record-level errors` });
  return { total: slice.length, success, failed, skipped, records, logs };
}
