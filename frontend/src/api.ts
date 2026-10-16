const BASE = (import.meta as any).env?.VITE_API_URL || "";

export function getToken(): string | null {
  return localStorage.getItem("relayops_token");
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem("relayops_token", t);
  else localStorage.removeItem("relayops_token");
}

export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...((opts.headers as any) || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...opts, headers, signal: AbortSignal.timeout(20000) });
  } catch (e: any) {
    throw new Error(e?.name === "TimeoutError" ? "Request timed out — is the API server running?" : "Cannot reach the API server (http://localhost:4000). Start the backend and retry.");
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    if (res.status === 401 && !path.includes("/auth/") && typeof window !== "undefined" && window.location.pathname !== "/login") {
      setToken(null);
      window.location.href = "/login";
      throw new Error("Session expired — please sign in again");
    }
    const msg = data?.error || `Request failed (${res.status})`;
    const err: any = new Error(msg);
    err.details = data?.details;
    err.status = res.status;
    throw err;
  }
  return data;
}
