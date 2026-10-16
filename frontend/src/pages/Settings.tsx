import React, { useEffect, useState } from "react";
import { api } from "../api";
import { toast } from "../components/ui";

export default function Settings() {
  const [me, setMe] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  useEffect(() => {
    api("/api/auth/me").then(setMe).catch(() => {});
    fetch(((import.meta as any).env?.VITE_API_URL || "") + "/api/health").then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);
  return (
    <div>
      <h1 className="display" style={{ fontSize: 28 }}>Settings</h1>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">Profile</div>
          <p className="card-sub">{me?.user?.name} · {me?.user?.email}</p>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Signed in with a workspace admin account. Sessions last 7 days.</p>
        </div>
        <div className="card">
          <div className="card-title">Environment & services</div>
          <p className="card-sub">Configure via environment variables. See .env.example.</p>
          <div className="mono" style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 6 }}>
            <div>API: {health ? "● online" : "○ unreachable"}</div>
            <div>Postgres: {health?.postgres ? "connected" : "SQLite file (local)"}</div>
            <div>Queue: {health?.redis ? "BullMQ + Redis" : "in-process runner"} · scheduler {health?.scheduler ? "on" : "off"}</div>
            <div>AI: {health?.ai ? `live (${health.aiProvider}/${health.aiModel})` : "built-in heuristic fallback"}</div>
          </div>
          <div className="card" style={{ marginTop: 12, background: "var(--surface-2)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>AI CONFIGURATION (optional)</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>For live AI diagnosis, set <span className="mono">AI_PROVIDER=gemini</span> + <span className="mono">GOOGLE_API_KEY</span> (free tier, Google AI Studio) or <span className="mono">AI_PROVIDER=openai</span> + <span className="mono">AI_API_KEY</span>. Without keys, RelayOps uses its built-in diagnostic engine.</div>
          </div>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => toast("Docs: see relayops/README.md")}>View setup docs</button>
        </div>
      </div>
    </div>
  );
}
