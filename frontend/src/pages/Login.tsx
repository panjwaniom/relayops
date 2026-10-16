import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setToken } from "../api";
import { toast } from "../components/ui";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("admin@relayops.io");
  const [password, setPassword] = useState("password123");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const data = mode === "login"
        ? await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })
        : await api("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
      setToken(data.token);
      toast("Welcome to RelayOps");
      nav("/");
    } catch (e: any) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        <div className="brand" style={{ padding: 0, marginBottom: 28 }}>
          <div className="brand-mark">R</div>
          <div><div className="brand-name">RelayOps</div><div className="brand-tag">sync infrastructure</div></div>
        </div>
        <h1 className="display" style={{ fontSize: 32, margin: "0 0 8px" }}>{mode === "login" ? "Welcome back" : "Create your workspace"}</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 24px" }}>Connect sources, map fields, and watch every record land — with receipts.</p>
        {err && <div className="card" style={{ borderColor: "var(--danger)", color: "var(--danger)", marginBottom: 12, padding: 12 }}>{err}</div>}
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "register" && <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>}
          <div><label className="label">Work email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><label className="label">Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: 13.5 }}>
          {mode === "login" ? "New here? " : "Already have an account? "}
          <Link to="#" onClick={(e) => { e.preventDefault(); setMode(mode === "login" ? "register" : "login"); }}> {mode === "login" ? "Create an account" : "Sign in"}</Link>
        </p>
        <div className="card" style={{ marginTop: 16, background: "var(--surface-2)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>DEMO CREDENTIALS</div>
          <div className="mono" style={{ fontSize: 12.5 }}>admin@relayops.io · password123</div>
        </div>
      </div>
      <div className="auth-hero">
        <div className="hero-grid" />
        <div style={{ position: "relative" }}>
          <div className="badge b-running">● LIVE SYNC</div>
          <h1>Data sync,<br />minus the drama.</h1>
          <p style={{ color: "#b9b6aa", maxWidth: 440 }}>RelayOps connects REST APIs and CSVs, validates every record, retries failures, and explains what broke — in plain English.</p>
        </div>
        <div style={{ position: "relative" }} className="log-box">
          <div>$ relayops sync stripe-customers</div>
          <div>✓ fetched 140 rows in 1.2s</div>
          <div>✓ 128 ok · <span className="log-warn">9 failed</span> · 3 skipped (duplicates)</div>
          <div className="log-warn">◷ retrying batch… backoff 2s</div>
          <div>✓ AI diagnosis ready → malformed emails</div>
        </div>
      </div>
    </div>
  );
}
