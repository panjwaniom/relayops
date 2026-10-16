import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api, getToken, setToken } from "../api";
import { Modal } from "./ui";

const NAV = [
  { to: "/", label: "Overview", icon: "◈", end: true },
  { to: "/integrations", label: "Integrations", icon: "⇄" },
  { to: "/jobs", label: "Sync Jobs", icon: "▶" },
  { to: "/activity", label: "Activity", icon: "≣" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const [cmdk, setCmdk] = useState(false);
  const [q, setQ] = useState("");
  const [notifs, setNotifs] = useState<any[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const unread = notifs.filter((n) => !n.read).length;

  useEffect(() => {
    if (!getToken()) return;
    api("/api/notifications").then((d) => setNotifs(d.notifications)).catch(() => {});
    const t = setInterval(() => api("/api/notifications").then((d) => setNotifs(d.notifications)).catch(() => {}), 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdk((v) => !v); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const logout = () => { setToken(null); nav("/login"); };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div><div className="brand-name">RelayOps</div><div className="brand-tag">sync infrastructure</div></div>
        </div>
        <div className="nav-label">Workspace</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={(n as any).end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </NavLink>
        ))}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Need a hand?</div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, margin: "4px 0 10px" }}>Run AI diagnosis on any failed job.</div>
            <button className="btn btn-sm btn-primary" onClick={() => nav("/jobs?status=failed")}>Inspect failures</button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Log out →</button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div className="search-pill" onClick={() => setCmdk(true)}>⌕ Search integrations, jobs… <span className="kbd">⌘K</span></div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btn-sm" onClick={() => setShowNotifs(true)}>🔔 {unread > 0 ? `(${unread})` : ""}</button>
          </div>
        </div>
        <div className="content">{children}</div>
        <nav className="mobile-nav">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={(n as any).end} className={({ isActive }) => (isActive ? "active" : "")}>{n.icon}<br />{n.label}</NavLink>)}
        </nav>
      </div>
      {cmdk && <CommandPalette q={q} setQ={setQ} close={() => setCmdk(false)} />}
      {showNotifs && (
        <Modal onClose={() => setShowNotifs(false)}>
          <h2 style={{ marginTop: 0 }}>Notifications</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button className="btn btn-sm" onClick={() => api("/api/notifications/read-all", { method: "POST" }).then(() => setNotifs((ns) => ns.map((n) => ({ ...n, read: true }))))}>Mark all read</button>
          </div>
          {notifs.length === 0 && <p style={{ color: "var(--muted)" }}>All caught up.</p>}
          {notifs.map((n) => (
            <div key={n.id} className="card" style={{ marginBottom: 8, padding: 12, opacity: n.read ? 0.65 : 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{n.title}</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>{n.body}</div>
              {!n.read && <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => api(`/api/notifications/${n.id}/read`, { method: "POST" }).then(() => setNotifs((ns) => ns.map((x) => x.id === n.id ? { ...x, read: true } : x)))}>Mark read</button>}
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}

function CommandPalette({ q, setQ, close }: { q: string; setQ: (s: string) => void; close: () => void }) {
  const nav = useNavigate();
  const [results, setResults] = useState<{ integrations: any[]; jobs: any[] }>({ integrations: [], jobs: [] });
  useEffect(() => {
    Promise.all([
      api(`/api/integrations?q=${encodeURIComponent(q)}`).catch(() => ({ integrations: [] })),
      api(`/api/jobs?q=${encodeURIComponent(q)}`).catch(() => ({ jobs: [] })),
    ]).then(([a, b]) => setResults({ integrations: (a.integrations || []).slice(0, 5), jobs: (b.jobs || []).slice(0, 5) }));
  }, [q]);
  return (
    <Modal onClose={close}>
      <input autoFocus className="input" placeholder="Type to search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="nav-label">Integrations</div>
      {results.integrations.map((i) => <div key={i.id} className="nav-item" style={{ cursor: "pointer" }} onClick={() => { nav(`/integrations/${i.id}`); close(); }}>⇄ {i.name}</div>)}
      <div className="nav-label">Jobs</div>
      {results.jobs.map((j) => <div key={j.id} className="nav-item" style={{ cursor: "pointer" }} onClick={() => { nav(`/jobs/${j.id}`); close(); }}>▶ {j.integration_name} · {j.status}</div>)}
    </Modal>
  );
}
