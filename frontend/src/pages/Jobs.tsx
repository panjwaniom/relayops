import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Badge, EmptyState, SkeletonCard, timeAgo, LoadError } from "../components/ui";

export default function Jobs() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const [q, setQ] = useState("");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const load = () => api(`/api/jobs?status=${status}&q=${encodeURIComponent(q)}`).then((d) => { setData(d); setErr(""); }).catch((e) => { if (!data) setErr(e.message); });
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [status, q]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 className="display" style={{ fontSize: 28, margin: 0 }}>Sync jobs</h1>
        <span style={{ color: "var(--muted)" }}>auto-refreshing</span>
      </div>
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search jobs…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chip-row">
          {["", "queued", "running", "success", "partial", "failed"].map((s) => (
            <button key={s} className={`chip${status === s ? " active" : ""}`} onClick={() => setParams(status === s ? {} : { status: s })}>{s || "All"}</button>
          ))}
        </div>
      </div>
      {!data && !err && <div className="grid grid-2">{[0, 1].map((i) => <SkeletonCard key={i} />)}</div>}
      {err && !data && <LoadError message={err} retry={load} />}
      {data && data.jobs.length === 0 && <div className="card"><EmptyState icon="▶" title="No jobs match" body="Run an integration to create the first job." /></div>}
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Job</th><th>Integration</th><th>Status</th><th>Records</th><th>Trigger</th><th>Duration</th><th>Created</th></tr></thead>
          <tbody>{data?.jobs.map((j: any) => (
            <tr key={j.id}>
              <td className="mono"><Link to={`/jobs/${j.id}`}>{j.id.slice(0, 8)}</Link></td>
              <td style={{ fontWeight: 600 }}>{j.integration_name || j.integration_id.slice(0, 8)}</td>
              <td><Badge status={j.status}>{j.status}</Badge></td>
              <td>{j.total_records} · <span style={{ color: "var(--success)" }}>{j.success_count} ok</span> · <span style={{ color: "var(--danger)" }}>{j.failed_count} failed</span></td>
              <td>{j.trigger}</td>
              <td>{j.duration_ms}ms</td>
              <td style={{ color: "var(--muted)" }}>{timeAgo(j.created_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
