export interface FetchResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  contentType: string;
  data?: any;
  error?: string;
}

export interface SourceAuth {
  auth_type?: string;
  auth_secret?: string | null;
}

export function buildSourceHeaders(url: string, auth: SourceAuth): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "RelayOps/1.0" };
  const secret = (auth.auth_secret || "").trim();
  if (!secret || auth.auth_type === "none" || !auth.auth_type) return headers;
  if (auth.auth_type === "bearer") headers.Authorization = `Bearer ${secret}`;
  else if (auth.auth_type === "api_key") {
    // support "Header-Name:value" or raw value defaulting to X-API-Key
    const idx = secret.indexOf(":");
    if (idx > 0) headers[secret.slice(0, idx).trim()] = secret.slice(idx + 1).trim();
    else headers["X-API-Key"] = secret;
  } else if (auth.auth_type === "basic") {
    // "username:password" → base64
    headers.Authorization = `Basic ${Buffer.from(secret.includes(":") ? secret : `:${secret}`).toString("base64")}`;
  }
  void url;
  return headers;
}

export async function fetchJsonSource(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<FetchResult> {
  const started = Date.now();
  const method = (opts.method || "GET").toUpperCase();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, status: 0, latencyMs: 0, contentType: "", error: "URL must start with http:// or https://" };
  }
  try {
    const res = await fetch(url, {
      method,
      headers: opts.headers || { Accept: "application/json", "User-Agent": "RelayOps/1.0" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12000),
    });
    const latencyMs = Date.now() - started;
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return { ok: false, status: res.status, latencyMs, contentType, error: `HTTP ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}` };
    }
    if (!/json/i.test(contentType)) {
      const sample = (await res.text()).slice(0, 200);
      return { ok: false, status: res.status, latencyMs, contentType, error: `Expected JSON but got "${contentType || "unknown"}". Sample: ${sample}` };
    }
    const data = await res.json();
    return { ok: true, status: res.status, latencyMs, contentType, data };
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "Request timed out after 12s" : e?.message || "Network error";
    return { ok: false, status: 0, latencyMs: Date.now() - started, contentType: "", error: msg };
  }
}

/** Extract row array from parsed JSON using an optional dot path (e.g. "data.items"). */
export function extractRows(data: any, dataPath: string): { rows: Record<string, any>[]; error?: string } {
  let node = data;
  const path = (dataPath || "").trim();
  if (path) {
    for (const part of path.split(".")) {
      if (node && typeof node === "object" && part in node) node = (node as any)[part];
      else return { rows: [], error: `data_path "${dataPath}" not found in response` };
    }
  }
  if (Array.isArray(node)) {
    const rows = node.filter((r) => r && typeof r === "object") as Record<string, any>[];
    if (rows.length === 0) return { rows: [], error: "Response array contains no objects" };
    return { rows };
  }
  if (node && typeof node === "object") return { rows: [node as Record<string, any>] };
  return { rows: [], error: "Response is not a JSON object or array — set data_path to the array" };
}

/** Flatten one level of nested objects for mapping UX (address.city → "address.city"). */
export function flattenKeys(obj: Record<string, any>, prefix = "", depth = 0): string[] {
  const keys: string[] = [];
  if (depth > 1) return Object.keys(obj);
  for (const k of Object.keys(obj)) {
    const v = (obj as any)[k];
    if (v && typeof v === "object" && !Array.isArray(v) && depth < 1) {
      for (const sub of Object.keys(v)) keys.push(`${k}.${sub}`);
    } else keys.push(prefix ? `${prefix}.${k}` : k);
  }
  return keys;
}

export function getByPath(obj: any, path: string): any {
  return String(path).split(".").reduce((acc, p) => (acc == null ? acc : acc[p]), obj);
}

/** Merge dot-path flattened keys into the row so mappings can target nested fields. */
export function resolveRow(r: Record<string, any>): Record<string, any> {
  const flat: Record<string, any> = {};
  for (const k of flattenKeys(r)) flat[k] = getByPath(r, k);
  return { ...r, ...flat };
}

export function maskSecret(secret: string | null | undefined): string {
  if (!secret) return "";
  const s = String(secret);
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}
