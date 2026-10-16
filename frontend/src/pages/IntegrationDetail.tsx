import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Badge, Skeleton, timeAgo, toast, LoadError } from "../components/ui";

export default function IntegrationDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("overview");
  const [preview, setPreview] = useState<any[]>([]);
  const [sourceFields, setSourceFields] = useState<string[]>([]);
  const load = () => { setErr(""); api(`/api/integrations/${id}`).then(setData).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (!data) return;
    api(`/api/integrations/${id}/preview`, { method: "POST", body: JSON.stringify({}) }).then((d) => { setPreview(d.preview); setSourceFields(d.sourceFields); }).catch(() => {});
  }, [data?.integration?.updated_at]);

  if (err && !data) return <LoadError message={err} retry={load} />;
  if (!data) return <div className="card"><Skeleton h={20} w="30%" /><div style={{ height: 12 }} /><Skeleton h={14} /><div style={{ height: 8 }} /><Skeleton h={14} w="60%" /></div>;
  const it = data.integration;
  const isLive = it.type === "rest" && /^https?:\/\//i.test(it.endpoint || "");

  const update = async (patch: any) => {
    const r = await api(`/api/integrations/${id}`, { method: "PUT", body: JSON.stringify(patch) });
    setData({ ...data, integration: { ...r.integration, mapping: JSON.parse(r.integration.mapping), transforms: JSON.parse(r.integration.transforms), validations: JSON.parse(r.integration.validations) } });
    toast("Saved");
  };
  const runNow = async () => { await api(`/api/integrations/${id}/run`, { method: "POST" }); toast("Job queued — running in background"); load(); };
  const testConn = async () => {
    try {
      const r = await api(`/api/integrations/${id}/test`, { method: "POST", body: JSON.stringify({}) });
      toast(`Connected · HTTP ${r.status || 200} · ${r.latencyMs}ms · ${r.rowCount ?? 0} rows`);
    } catch (e: any) { toast(`Connection failed: ${e.message}`); }
  };
  const remove = async () => {
    if (!confirm("Delete this integration and its jobs?")) return;
    await api(`/api/integrations/${id}`, { method: "DELETE" });
    nav("/integrations");
  };

  return (
    <div>
      <Link to="/integrations" style={{ color: "var(--muted)", textDecoration: "none", fontSize: 13 }}>← All integrations</Link>
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0 16px", flexWrap: "wrap" }}>
        <h1 className="display" style={{ fontSize: 28, margin: 0 }}>{it.name}</h1>
        <Badge status={it.status}>{it.status}</Badge>
        <span className="badge">{it.type}</span>
        {it.type === "rest" && <Badge status={isLive ? "success" : "warning"}>{isLive ? "● live source" : "○ demo data"}</Badge>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-sm" onClick={testConn}>Test connection</button>
          <button className="btn btn-sm btn-primary" onClick={runNow}>▶ Run now</button>
          <button className="btn btn-sm btn-danger" onClick={remove}>Delete</button>
        </div>
      </div>
      <div className="tabs">
        {["overview", "mapping", "jobs"].map((t) => <button key={t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      {tab === "overview" && (
        <div className="grid grid-2">
          <div className="card">
            <div className="card-title">Configuration</div>
            <div className="grid grid-2">
              <div><label className="label">Schedule</label>
                <select className="select" value={it.schedule} onChange={(e) => update({ schedule: e.target.value })}>
                  {["manual", "every_5m", "every_15m", "hourly", "daily"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select></div>
              <div><label className="label">Next automatic run</label>
                <input className="input" disabled value={it.schedule === "manual" ? "Manual only" : it.next_run_at ? new Date(it.next_run_at).toLocaleString() : "Due shortly"} /></div>
            </div>
            {it.type === "rest" ? (
              <>
                <div style={{ marginTop: 10 }}><label className="label">Endpoint (https URL for live data, empty for demo feed)</label><input className="input mono" defaultValue={it.endpoint} placeholder="https://api.example.com/v1/customers" onBlur={(e) => e.target.value !== (it.endpoint || "") && update({ endpoint: e.target.value })} /></div>
                <div className="grid grid-3" style={{ marginTop: 10 }}>
                  <div><label className="label">Method</label><select className="select" value={it.method || "GET"} onChange={(e) => update({ method: e.target.value })}><option>GET</option><option>POST</option></select></div>
                  <div><label className="label">Auth</label><select className="select" value={it.auth_type || "none"} onChange={(e) => update({ auth_type: e.target.value })}><option value="none">None</option><option value="bearer">Bearer token</option><option value="api_key">API key</option><option value="basic">Basic</option></select></div>
                  <div><label className="label">Rows at (data path)</label><input className="input mono" defaultValue={it.data_path || ""} placeholder="data.items" onBlur={(e) => e.target.value !== (it.data_path || "") && update({ data_path: e.target.value })} /></div>
                </div>
                {(it.auth_type && it.auth_type !== "none") && (
                  <div style={{ marginTop: 10 }}><label className="label">Credential {it.has_secret ? `(saved ${it.secret_hint})` : ""} — {it.auth_type === "api_key" ? "key or Header-Name:key" : it.auth_type === "basic" ? "username:password" : "token"}</label>
                    <input className="input mono" type="password" placeholder={it.has_secret ? "•••••••• (leave blank to keep)" : "paste credential — stored server-side, never displayed"} onBlur={(e) => e.target.value && update({ auth_secret: e.target.value })} /></div>
                )}
                <p style={{ color: "var(--muted)", fontSize: 12.5 }}>Credentials are stored on the server and never returned to the browser{it.has_secret ? ` (on file: ${it.secret_hint})` : ""}. Nested fields map with dot paths (e.g. address.city).</p>
              </>
            ) : (
              <div style={{ marginTop: 10 }}><label className="label">CSV data</label><textarea className="textarea" defaultValue={it.csv_text || ""} onBlur={(e) => e.target.value !== (it.csv_text || "") && update({ csvText: e.target.value })} /></div>
            )}
            <div style={{ marginTop: 10 }}><label className="label">Description</label><textarea className="textarea" style={{ fontFamily: "var(--font-ui)" }} defaultValue={it.description} onBlur={(e) => update({ description: e.target.value })} /></div>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Last run {it.last_run_at ? timeAgo(it.last_run_at) : "never"} · {it.last_status || "—"}</p>
          </div>
          <div className="card">
            <div className="card-title">Live data preview</div>
            <p className="card-sub">Source fields: {sourceFields.join(", ") || "—"}</p>
            <div className="table-wrap"><table className="tbl"><thead><tr><th>Input</th><th>→ Output</th></tr></thead>
              <tbody>{preview.slice(0, 5).map((p: any, i: number) => (
                <tr key={i}><td className="mono" style={{ fontSize: 12 }}>{JSON.stringify(p.input).slice(0, 90)}</td><td className="mono" style={{ fontSize: 12 }}>{JSON.stringify(p.output).slice(0, 90)}</td></tr>
              ))}</tbody></table></div>
          </div>
        </div>
      )}
      {tab === "mapping" && <MappingEditor integration={it} sourceFields={sourceFields} onSave={update} />}
      {tab === "jobs" && (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Job</th><th>Status</th><th>Records</th><th>Duration</th><th>Created</th></tr></thead>
          <tbody>{data.jobs.map((j: any) => (
            <tr key={j.id}><td className="mono"><Link to={`/jobs/${j.id}`}>{j.id.slice(0, 8)}</Link></td><td><Badge status={j.status}>{j.status}</Badge></td>
              <td>{j.success_count} ok · {j.failed_count} failed · {j.skipped_count} skipped</td><td>{j.duration_ms}ms</td><td>{timeAgo(j.created_at)}</td></tr>
          ))}</tbody></table></div>
      )}
    </div>
  );
}

function MappingEditor({ integration, sourceFields, onSave }: { integration: any; sourceFields: string[]; onSave: (p: any) => void }) {
  const [mapping, setMapping] = useState<any[]>(integration.mapping || []);
  const [transforms, setTransforms] = useState<any[]>(integration.transforms || []);
  const [validations, setValidations] = useState<any[]>(integration.validations || []);
  const [preview, setPreview] = useState<any[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const refreshPreview = async () => {
    const d = await api(`/api/integrations/${integration.id}/preview`, { method: "POST", body: JSON.stringify({ mapping, transforms }) });
    setPreview(d.preview);
  };
  const suggest = async () => {
    if (sourceFields.length === 0) { toast("Fetch a preview first so AI can see source fields"); return; }
    setSuggesting(true);
    try {
      const r = await api("/api/ai/suggest-mapping", { method: "POST", body: JSON.stringify({ fields: sourceFields }) });
      const existing = new Set(mapping.map((m: any) => m.target));
      const fresh = r.suggestions.filter((s: any) => !existing.has(s.target)).map((s: any) => ({ source: s.source, target: s.target }));
      if (fresh.length > 0) setMapping((m) => [...m, ...fresh]);
      setAiNote(`${fresh.length} suggestion${fresh.length === 1 ? "" : "s"} applied (${r.provider === "live" ? "live AI " + (r.model || "") : "built-in matcher"})`);
      refreshPreview();
    } catch (e: any) { toast(e.message); } finally { setSuggesting(false); }
  };
  useEffect(() => { refreshPreview(); }, []);
  return (
    <div className="grid grid-2">
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>Field mapping</div>
          <button className="btn btn-sm" style={{ marginLeft: "auto" }} disabled={suggesting} onClick={suggest}>✦ {suggesting ? "Thinking…" : "AI suggest"}</button>
        </div>
        {aiNote && <p style={{ color: "var(--accent)", fontSize: 12.5 }}>{aiNote}</p>}
        {mapping.map((m: any, i: number) => (
          <div key={i} className="mapping-row">
            <input className="input mono" value={m.source} onChange={(e) => setMapping((s) => s.map((x, xi) => xi === i ? { ...x, source: e.target.value } : x))} placeholder="source" />
            <input className="input mono" value={m.target} onChange={(e) => setMapping((s) => s.map((x, xi) => xi === i ? { ...x, target: e.target.value } : x))} placeholder="target" />
            <button className="btn btn-sm" onClick={() => setMapping((s) => s.filter((_, xi) => xi !== i))}>✕</button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => setMapping((s) => [...s, { source: "", target: "" }])}>+ Add mapping</button>
        <div className="card-title" style={{ marginTop: 18 }}>Transforms</div>
        {transforms.map((t: any, i: number) => (
          <div key={i} className="mapping-row">
            <input className="input mono" value={t.field} onChange={(e) => setTransforms((s) => s.map((x, xi) => xi === i ? { ...x, field: e.target.value } : x))} placeholder="field" />
            <select className="select" value={t.op} onChange={(e) => setTransforms((s) => s.map((x, xi) => xi === i ? { ...x, op: e.target.value } : x))}>
              {["trim", "lowercase", "uppercase", "to_number", "to_date", "default", "strip_html"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <button className="btn btn-sm" onClick={() => setTransforms((s) => s.filter((_, xi) => xi !== i))}>✕</button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => setTransforms((s) => [...s, { field: "email", op: "trim" }])}>+ Add transform</button>
        <div className="card-title" style={{ marginTop: 18 }}>Validations</div>
        {validations.map((v: any, i: number) => (
          <div key={i} className="mapping-row">
            <input className="input mono" value={v.field} onChange={(e) => setValidations((s) => s.map((x, xi) => xi === i ? { ...x, field: e.target.value } : x))} placeholder="field" />
            <select className="select" value={v.rule} onChange={(e) => setValidations((s) => s.map((x, xi) => xi === i ? { ...x, rule: e.target.value } : x))}>
              {["required", "email", "number", "min_length", "max_length", "range", "unique"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <button className="btn btn-sm" onClick={() => setValidations((s) => s.filter((_, xi) => xi !== i))}>✕</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => setValidations((s) => [...s, { field: "email", rule: "email" }])}>+ Add validation</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={() => { onSave({ mapping, transforms, validations }); refreshPreview(); }}>Save & preview</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Transformation preview</div>
        <p className="card-sub">First rows after mapping + transforms.</p>
        {preview.slice(0, 6).map((p: any, i: number) => (
          <div key={i} className="card" style={{ padding: 10, marginBottom: 8, background: "var(--surface-2)" }}>
            <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>IN {JSON.stringify(p.input)}</div>
            <div className="mono" style={{ fontSize: 11.5 }}>OUT {JSON.stringify(p.output)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
