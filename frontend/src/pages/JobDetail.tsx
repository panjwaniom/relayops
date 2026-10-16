import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";
import { Badge, Skeleton, timeAgo, toast, LoadError } from "../components/ui";

export default function JobDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [recordFilter, setRecordFilter] = useState("");
  const [ai, setAi] = useState<any>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const load = () => api(`/api/jobs/${id}${recordFilter ? `?recordStatus=${recordFilter}` : ""}`).then((d) => { setData(d); setErr(""); }).catch((e) => { if (!data) setErr(e.message); });
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [id, recordFilter]);

  const retry = async () => {
    try { const r = await api(`/api/jobs/${id}/retry`, { method: "POST" }); toast("Retry queued"); window.location.href = `/jobs/${r.job.id}`; }
    catch (e: any) { toast(e.message); }
  };
  const diagnose = async () => {
    setAiBusy(true);
    try { const r = await api(`/api/jobs/${id}/analyze`, { method: "POST" }); setAi(r.analysis); }
    catch (e: any) { toast(e.message); } finally { setAiBusy(false); }
  };

  if (err && !data) return <LoadError message={err} retry={load} />;
  if (!data) return <div className="card"><Skeleton h={20} w="30%" /><div style={{ height: 12 }} /><Skeleton h={120} /></div>;
  const j = data.job;
  const pct = j.total_records ? Math.round((j.success_count / j.total_records) * 100) : 0;

  return (
    <div>
      <Link to="/jobs" style={{ color: "var(--muted)", textDecoration: "none", fontSize: 13 }}>← All jobs</Link>
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0 16px", flexWrap: "wrap" }}>
        <h1 className="display mono" style={{ fontSize: 26, margin: 0 }}>job {j.id.slice(0, 8)}</h1>
        <Badge status={j.status}>{j.status}</Badge>
        <span style={{ color: "var(--muted)" }}>{j.integration_name} · {j.trigger} · {timeAgo(j.created_at)}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-sm" onClick={diagnose} disabled={aiBusy}>✦ {aiBusy ? "Analyzing…" : "AI diagnosis"}</button>
          <button className="btn btn-sm btn-primary" onClick={retry}>↻ Retry</button>
        </div>
      </div>
      {j.error_summary && <div className="card" style={{ borderColor: "var(--danger)", marginBottom: 12 }}>⚠ {j.error_summary}</div>}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {[["Total", j.total_records], ["Succeeded", j.success_count], ["Failed", j.failed_count], ["Skipped", j.skipped_count]].map(([l, v]) => (
          <div key={l as string} className="card stat"><div className="stat-label">{l}</div><div className="stat-value">{v}</div></div>
        ))}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><span>Success rate</span><span>{pct}% · {j.duration_ms}ms · attempt {j.attempts}</span></div>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      </div>
      {ai && (
        <div className="card ai-card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span>✦</span><div className="card-title">AI failure analysis</div><Badge status={ai.provider === "live" ? "success" : "warning"}>{ai.provider === "live" ? `live · ${ai.model || "model"}` : "built-in diagnosis"}</Badge></div>
          {ai.note && <p style={{ color: "var(--warning)", fontSize: 13 }}>ⓘ {ai.note}</p>}
          {ai.provider !== "live" && !ai.note && <p style={{ color: "var(--muted)", fontSize: 13 }}>Built-in diagnosis shown — add a Gemini API key (see Settings) to enable live AI analysis.</p>}
          <p>{ai.summary}</p>
          <div className="grid grid-2">
            <div><div className="card-title" style={{ fontSize: 13 }}>Likely root causes</div>{ai.rootCauses.map((c: any, i: number) => <div key={i} style={{ marginBottom: 8 }}><div style={{ fontWeight: 700 }}>• {c.cause}</div><div style={{ color: "var(--muted)", fontSize: 13 }}>{c.evidence}</div></div>)}</div>
            <div><div className="card-title" style={{ fontSize: 13 }}>Suggested fixes</div><ol style={{ paddingLeft: 18, margin: 0 }}>{ai.suggestions.map((s: string, i: number) => <li key={i} style={{ marginBottom: 6 }}>{s}</li>)}</ol></div>
          </div>
        </div>
      )}
      <div className="grid grid-2">
        <div className="card">
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <div className="card-title" style={{ margin: 0 }}>Record results ({data.records.length})</div>
            <div className="chip-row" style={{ marginLeft: "auto" }}>
              {["", "success", "failed", "skipped"].map((s) => <button key={s} className={`chip${recordFilter === s ? " active" : ""}`} onClick={() => setRecordFilter(s)}>{s || "All"}</button>)}
            </div>
          </div>
          <div style={{ maxHeight: 480, overflow: "auto" }}>
            {data.records.slice(0, 60).map((r: any) => (
              <div key={r.id} className="card" style={{ padding: 10, marginBottom: 8, background: "var(--surface-2)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Badge status={r.status}>{r.status}</Badge><span className="mono" style={{ fontSize: 12 }}>row {r.row_index}</span></div>
                {r.error && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 4 }}>⚠ {r.error}</div>}
                <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>OUT {JSON.stringify(r.output)?.slice(0, 160)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Execution logs</div>
          <div className="log-box">
            {data.logs.map((l: any) => <div key={l.id} className={l.level === "warn" ? "log-warn" : l.level === "error" ? "log-error" : ""}>[{l.level}] {l.message}</div>)}
            {data.logs.length === 0 && <div>waiting for worker…</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
