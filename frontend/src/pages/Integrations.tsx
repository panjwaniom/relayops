import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Badge, EmptyState, Modal, SkeletonCard, timeAgo, toast, LoadError } from "../components/ui";

const SCHEDULES = ["manual", "every_5m", "every_15m", "hourly", "daily"];

export default function Integrations() {
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState("");
  const load = () => { setErr(""); api(`/api/integrations?q=${encodeURIComponent(q)}&status=${status}`).then(setData).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q, status]);

  const runNow = async (id: string) => {
    toast("Queued sync job…");
    await api(`/api/integrations/${id}/run`, { method: "POST" });
    toast("Job running — check Sync Jobs");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 className="display" style={{ fontSize: 28, margin: 0 }}>Integrations</h1>
        <span style={{ color: "var(--muted)" }}>{data?.integrations.length ?? ""} sources</span>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setShowNew(true)}>+ New integration</button>
      </div>
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search integrations…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chip-row">
          {["", "healthy", "degraded"].map((s) => (
            <button key={s} className={`chip${status === s ? " active" : ""}`} onClick={() => setStatus(s)}>{s || "All"}</button>
          ))}
        </div>
      </div>
      {!data && !err && <div className="grid grid-3">{[0, 1, 2].map((i) => <SkeletonCard key={i} />)}</div>}
      {err && !data && <LoadError message={err} retry={load} />}
      {data && data.integrations.length === 0 && (
        <div className="card"><EmptyState icon="⇄" title="No integrations found" body="Connect your first REST API or upload a CSV to start syncing." action={<button className="btn btn-primary" onClick={() => setShowNew(true)}>Create integration</button>} /></div>
      )}
      <div className="grid grid-3">
        {data?.integrations.map((it: any) => (
          <div key={it.id} className="card hoverable">
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <Badge status={it.status}>{it.status}</Badge>
              <span className="badge">{it.type === "rest" ? "REST API" : "CSV"}</span>
              {it.type === "rest" && (/^https?:\/\//i.test(it.endpoint || "") ? <span className="badge b-success">● live</span> : <span className="badge b-warning">○ demo</span>)}
              <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>{it.schedule.replace(/_/g, " ")}</span>
            </div>
            <Link to={`/integrations/${it.id}`} style={{ textDecoration: "none" }}><div className="card-title" style={{ fontSize: 17 }}>{it.name}</div></Link>
            <p className="card-sub" style={{ minHeight: 38 }}>{it.description || "No description"}</p>
            <div className="mono" style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis" }}>{it.endpoint || (it.type === "csv" ? "pasted csv data" : "demo feed")}</div>
            {it.schedule !== "manual" && it.next_run_at && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>⏱ next auto-run {new Date(it.next_run_at).toLocaleString()}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn btn-sm btn-primary" onClick={() => runNow(it.id)}>Run now</button>
              <Link className="btn btn-sm" to={`/integrations/${it.id}`}>Configure</Link>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>{it.jobCount} jobs · {it.last_run_at ? timeAgo(it.last_run_at) : "never"}</span>
            </div>
          </div>
        ))}
      </div>
      {showNew && <NewIntegrationModal close={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

export function NewIntegrationModal({ close }: { close: () => void }) {
  const [form, setForm] = useState({ name: "", type: "rest", endpoint: "", schedule: "every_15m", description: "", csvText: "full_name,email,plan\nAva,ava@example.com,growth" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    setBusy(true); setErr("");
    try {
      await api("/api/integrations", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          mapping: [{ source: "full_name", target: "name", required: true }, { source: "email", target: "email", required: true }],
          transforms: [{ field: "email", op: "lowercase" }],
          validations: [{ field: "email", rule: "email" }, { field: "email", rule: "required" }],
        }),
      });
      toast("Integration created");
      close();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={close}>
      <h2 style={{ marginTop: 0 }}>New integration</h2>
      {err && <div style={{ color: "var(--danger)", marginBottom: 8 }}>{err}</div>}
      <label className="label">Name</label><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Stripe Customers" />
      <div className="grid grid-2" style={{ marginTop: 10 }}>
        <div><label className="label">Type</label><select className="select" value={form.type} onChange={(e) => set("type", e.target.value)}><option value="rest">REST API</option><option value="csv">CSV import</option></select></div>
        <div><label className="label">Schedule</label><select className="select" value={form.schedule} onChange={(e) => set("schedule", e.target.value)}>{SCHEDULES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      </div>
      {form.type === "rest"
        ? <div style={{ marginTop: 10 }}><label className="label">Endpoint — any public JSON API (e.g. https://jsonplaceholder.typicode.com/users). Leave empty for a demo feed.</label><input className="input mono" value={form.endpoint} onChange={(e) => set("endpoint", e.target.value)} placeholder="https://…" /></div>
        : <div style={{ marginTop: 10 }}><label className="label">CSV data</label><textarea className="textarea" value={form.csvText} onChange={(e) => set("csvText", e.target.value)} /></div>}
      <div style={{ marginTop: 10 }}><label className="label">Description</label><input className="input" value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="btn btn-primary" disabled={busy || form.name.length < 2} onClick={submit}>{busy ? "Creating…" : "Create integration"}</button>
        <button className="btn" onClick={close}>Cancel</button>
      </div>
    </Modal>
  );
}
