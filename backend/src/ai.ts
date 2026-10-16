import { config } from "./config";
import { dbAll, dbGet } from "./db";

export type AiProvider = "gemini" | "openai" | "fallback";

export interface AiAnalysis {
  summary: string;
  rootCauses: Array<{ cause: string; evidence: string }>;
  suggestions: string[];
  provider: "live" | "fallback";
  model?: string;
  note?: string;
}

function configuredProvider(): Exclude<AiProvider, "fallback"> | null {
  const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
  const openaiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
  const want = (process.env.AI_PROVIDER || "").toLowerCase();
  if ((want === "gemini" || (!want && geminiKey)) && geminiKey) return "gemini";
  if ((want === "openai" || (!want && openaiKey)) && openaiKey) return "openai";
  if (want === "gemini" && geminiKey) return "gemini";
  if (want === "openai" && openaiKey) return "openai";
  return null;
}

export function aiStatus(): { provider: AiProvider; model: string; configured: boolean } {
  const p = configuredProvider();
  if (p === "gemini") return { provider: "gemini", model: process.env.AI_MODEL || "gemini-3.8-flash", configured: true };
  if (p === "openai") return { provider: "openai", model: config.aiModel, configured: true };
  return { provider: "fallback", model: "heuristic", configured: false };
}

async function callGemini(prompt: string, system: string): Promise<string> {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
  const model = process.env.AI_MODEL || "gemini-3.8-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Gemini HTTP ${res.status}: ${body}`);
  }
  const data: any = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  if (!text) throw new Error("Gemini returned an empty response (possibly rate-limited)");
  return text;
}

async function callOpenAI(prompt: string, system: string): Promise<string> {
  const res = await fetch(`${config.aiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.aiApiKey}` },
    body: JSON.stringify({
      model: config.aiModel,
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`AI HTTP ${res.status}: ${body}`);
  }
  const data: any = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("AI provider returned an empty response");
  return text;
}

async function complete(prompt: string, system: string): Promise<{ text: string; model: string }> {
  const p = configuredProvider();
  if (p === "gemini") return { text: await callGemini(prompt, system), model: process.env.AI_MODEL || "gemini-3.8-flash" };
  if (p === "openai") return { text: await callOpenAI(prompt, system), model: config.aiModel };
  throw new Error("No AI provider configured");
}

function extractJson(text: string): any | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function analyzeJob(jobId: string): Promise<AiAnalysis> {
  const job = await dbGet(`SELECT * FROM jobs WHERE id = ?`, [jobId]);
  if (!job) throw new Error("Job not found");
  const integration = await dbGet(`SELECT * FROM integrations WHERE id = ?`, [job.integration_id]);
  const failed = await dbAll(`SELECT * FROM job_records WHERE job_id = ? AND status = 'failed' ORDER BY row_index LIMIT 25`, [jobId]);
  const logs = await dbAll(`SELECT * FROM job_logs WHERE job_id = ? ORDER BY created_at`, [jobId]);

  const errorCounts = new Map<string, number>();
  for (const r of failed) {
    const key = String(r.error || "unknown");
    errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
  }
  const topErrors = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const context = [
    `Integration: ${integration?.name} (type=${integration?.type}, schedule=${integration?.schedule})`,
    `Mapping: ${integration?.mapping}`,
    `Validations: ${integration?.validations}`,
    `Job ${job.id}: status=${job.status}, trigger=${job.trigger}, total=${job.total_records}, ok=${job.success_count}, failed=${job.failed_count}, skipped=${job.skipped_count}, attempts=${job.attempts}`,
    `Top errors:`,
    ...topErrors.map(([e, c]) => `- (${c}x) ${e}`),
    `Sample failed rows:`,
    ...failed.slice(0, 5).map((r: any) => `- row ${r.row_index}: ${r.error} | input=${r.input_json}`),
    `Logs:`,
    ...logs.slice(0, 10).map((l: any) => `[${l.level}] ${l.message}`),
  ].join("\n");

  const st = aiStatus();
  if (st.configured) {
    try {
      const { text, model } = await complete(
        context,
        "You are RelayOps failure analyst for a data-sync pipeline. Explain failures concretely using the evidence. Reply ONLY with JSON: {\"summary\": string (2-3 sentences), \"rootCauses\": [{\"cause\": string, \"evidence\": string}] (max 4), \"suggestions\": [string] (3-5 concrete fixes referencing actual field names)}."
      );
      const parsed = extractJson(text);
      if (parsed?.summary && Array.isArray(parsed.rootCauses) && Array.isArray(parsed.suggestions)) {
        return { summary: parsed.summary, rootCauses: parsed.rootCauses.slice(0, 4), suggestions: parsed.suggestions.slice(0, 5), provider: "live", model };
      }
      return { summary: text.slice(0, 800), rootCauses: topErrors.map(([e, c]) => ({ cause: e, evidence: `${c} occurrences` })), suggestions: ["Fix the top error class first", "Re-run after fixing source data"], provider: "live", model };
    } catch (e: any) {
      console.warn(`[ai] ${st.provider} failed, using fallback:`, e.message);
      const fb = fallbackAnalysis(job, topErrors);
      fb.note = `Live AI (${st.provider}/${st.model}) unavailable: ${e.message}. Showing built-in diagnosis.`;
      return fb;
    }
  }
  return fallbackAnalysis(job, topErrors);
}

export interface MappingSuggestion {
  source: string;
  target: string;
  confidence: "high" | "medium" | "low";
  reason?: string;
}

const FIELD_SYNONYMS: Array<{ target: string; match: RegExp }> = [
  { target: "name", match: /^(full.?name|name|contact|customer|title)$/i },
  { target: "email", match: /^(email|e.?mail|emailaddress)$/i },
  { target: "plan", match: /^(plan|tier|segment|package)$/i },
  { target: "status", match: /^(status|state|lifecycle|stage)$/i },
  { target: "amount", match: /^(amount|mrr|price|total|revenue|value)$/i },
  { target: "created", match: /^(created|created.?at|date|timestamp|joined)$/i },
  { target: "id", match: /^(id|external.?id|uuid|key)$/i },
  { target: "phone", match: /^(phone|mobile|tel)$/i },
  { target: "company", match: /^(company|organization|org|account)$/i },
];

export function heuristicMappings(fields: string[]): MappingSuggestion[] {
  const out: MappingSuggestion[] = [];
  const used = new Set<string>();
  for (const f of fields) {
    const leaf = f.split(".").pop() || f;
    const hit = FIELD_SYNONYMS.find((s) => s.match.test(leaf) && !used.has(s.target));
    if (hit) {
      used.add(hit.target);
      out.push({ source: f, target: hit.target, confidence: leaf.toLowerCase() === hit.target ? "high" : "medium", reason: `Matched known pattern for "${hit.target}"` });
    }
  }
  return out;
}

export async function suggestMappings(fields: string[]): Promise<{ suggestions: MappingSuggestion[]; provider: "live" | "fallback"; model?: string }> {
  const clean = [...new Set(fields)].filter(Boolean).slice(0, 40);
  const st = aiStatus();
  if (st.configured) {
    try {
      const { text, model } = await complete(
        `Source fields: ${clean.join(", ")}\nSuggest target field mappings for a normalized customer/order record. Prefer targets: name, email, plan, status, amount, created, id, phone, company.`,
        "You map source API fields to canonical targets. Reply ONLY with JSON: {\"mappings\": [{\"source\": string, \"target\": string, \"confidence\": \"high\"|\"medium\"|\"low\"}]}."
      );
      const parsed = extractJson(text);
      if (parsed && Array.isArray(parsed.mappings)) {
        return { suggestions: parsed.mappings.filter((m: any) => m.source && m.target).slice(0, 20), provider: "live", model };
      }
    } catch (e: any) {
      console.warn(`[ai] suggestMappings live failed:`, e.message);
    }
  }
  return { suggestions: heuristicMappings(clean), provider: "fallback" as const };
}

function fallbackAnalysis(job: any, topErrors: [string, number][]): AiAnalysis {
  const causes = topErrors.map(([err, count]) => {
    let cause = "Validation rule mismatch";
    let evidence = `${count} records failed with "${err}"`;
    if (/email/i.test(err)) {
      cause = "Malformed email addresses from source";
      evidence += ". The source allows free-text emails; add lowercase+trim transforms and quarantine non-matching rows.";
    } else if (/required/i.test(err)) {
      cause = "Missing required fields";
      evidence += ". Source rows omit the column; map a default value or make the field optional.";
    } else if (/number/i.test(err) || /between/i.test(err)) {
      cause = "Type coercion failure (string → number)";
      evidence += ". Numeric values arrive as text; add a to_number transform plus a range validation.";
    } else if (/unique/i.test(err)) {
      cause = "Duplicate keys inside the same batch";
      evidence += ". The source emitted the same key twice; deduplicate by content hash or widen the unique key.";
    } else if (/HTTP|timed out|network|JSON/i.test(err)) {
      cause = "Source API fetch failure";
      evidence += ". The endpoint did not return usable JSON; check auth, data_path, and rate limits.";
    }
    return { cause, evidence };
  });
  if (causes.length === 0) causes.push({ cause: "No record-level errors captured", evidence: "Job produced zero failures; check error_summary and logs." });
  return {
    summary: `Job ${String(job.id).slice(0, 8)} ended ${job.status} with ${job.failed_count} failed / ${job.total_records} total records. The dominant failure pattern is "${topErrors[0]?.[0] ?? "none"}" (${topErrors[0]?.[1] ?? 0}x). Successes (${job.success_count}) prove the pipeline and destination work — this is a source-data quality issue, not an outage.`,
    rootCauses: causes,
    suggestions: [
      "Open the failed-rows table, filter by error, and fix the top error class first — it usually covers 70%+ of failures.",
      "Add transforms before validation: trim → lowercase (emails), to_number (amounts), defaults for blanks.",
      "Preview mappings on sample rows before re-running to catch source schema drift.",
      `Re-run with Run Now; duplicates are skipped automatically via content hashing (${job.skipped_count} skipped last run).`,
      "If failures persist, narrow the source query or pre-filter rows you don't need.",
    ],
    provider: "fallback",
    model: "heuristic",
  };
}
