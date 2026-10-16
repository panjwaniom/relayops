import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { api } from "../api";
import { Badge, SkeletonCard, timeAgo, LoadError } from "../components/ui";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [nonce, setNonce] = useState(0);
  useEffect(() => { setErr(""); api("/api/summary").then(setData).catch((e) => setErr(e.message)); }, [nonce]);
  if (err && !data) return <LoadError message={err} retry={() => setNonce((n) => n + 1)} />;
  if (!data) return <div className="grid grid-4">{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>;
  const t = data.totals;
  const stats = [
    { label: "Records processed", value: t.recordsProcessed.toLocaleString(), sub: `${t.recordsOk.toLocaleString()} ok · ${t.recordsFailed.toLocaleString()} failed`, delta: `${t.successRate}% job success` },
    { label: "Integrations", value: t.integrations, sub: `${t.healthy} healthy`, delta: t.integrations - t.healthy > 0 ? `${t.integrations - t.healthy} need attention` : "all green" },
    { label: "Sync jobs", value: t.jobs, sub: `${t.jobsOk} succeeded`, delta: t.jobsFailed > 0 ? `${t.jobsFailed} partial/failed` : "no failures" },
    { label: "Success rate", value: `${t.successRate}%`, sub: "last 60 jobs", delta: t.successRate >= 80 ? "on track" : "investigate" },
  ];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <h1 className="display" style={{ fontSize: 30, margin: 0 }}>Good morning. Here's the pipeline.</h1>
      </div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {stats.map((s) => (
          <div key={s.label} className="card stat hoverable">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{s.sub}</div>
            <div className="stat-delta" style={{ color: "var(--accent)" }}>{s.delta}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Records synced — last 14 days</div>
          <p className="card-sub">Successful vs failed records per day.</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={data.series}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)" }} />
                <Area type="monotone" dataKey="success" stackId="1" stroke="#0e7c4a" fill="#0e7c4a" fillOpacity={0.25} name="Succeeded" />
                <Area type="monotone" dataKey="failed" stackId="1" stroke="#b4232a" fill="#b4232a" fillOpacity={0.3} name="Failed" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Throughput by integration</div>
          <p className="card-sub">Successful records per source.</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={data.byIntegration} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} stroke="var(--muted)" />
                <Tooltip contentStyle={{ borderRadius: 10 }} />
                <Bar dataKey="success" fill="var(--accent)" radius={[0, 6, 6, 0]} name="Succeeded" />
                <Bar dataKey="failed" fill="#b4232a" radius={[0, 6, 6, 0]} name="Failed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">Recent jobs</div>
          <p className="card-sub">Latest executions across all integrations.</p>
          {data.recentJobs.map((j: any) => (
            <Link key={j.id} to={`/jobs/${j.id}`} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)" }}>
              <Badge status={j.status}>{j.status}</Badge>
              <span style={{ fontWeight: 600 }}>{j.integration_name || "Integration"}</span>
              <span style={{ color: "var(--muted)", fontSize: 12.5 }}>{j.success_count} ok · {j.failed_count} failed</span>
              <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12.5 }}>{timeAgo(j.created_at)}</span>
            </Link>
          ))}
        </div>
        <div className="card">
          <div className="card-title">Integration health</div>
          <p className="card-sub">Status at a glance.</p>
          {data.byIntegration.map((b: any) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)" }}>
              <Badge status={b.status}>{b.status}</Badge>
              <Link to={`/integrations/${b.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>{b.name}</Link>
              <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12.5 }}>{b.jobs} jobs</span>
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <div className="card-title" style={{ fontSize: 13 }}>Recent activity</div>
            {data.activity.slice(0, 4).map((a: any) => <div key={a.id} style={{ fontSize: 13, color: "var(--muted)", padding: "4px 0" }}>• {a.title} <span style={{ opacity: 0.7 }}>({timeAgo(a.created_at)})</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
