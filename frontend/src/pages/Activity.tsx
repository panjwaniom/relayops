import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Skeleton, timeAgo, LoadError } from "../components/ui";

export default function Activity() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const load = () => { setErr(""); api("/api/activity?limit=60").then(setData).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); }, []);
  if (err && !data) return <LoadError message={err} retry={load} />;
  if (!data) return <div className="card"><Skeleton h={14} /><div style={{ height: 8 }} /><Skeleton h={14} w="70%" /></div>;
  return (
    <div>
      <h1 className="display" style={{ fontSize: 28 }}>Activity</h1>
      <div className="card">
        {data.activity.map((a: any) => (
          <div key={a.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--bg-subtle)", display: "grid", placeItems: "center" }}>{a.kind === "job" ? "▶" : "✦"}</div>
            <div><div style={{ fontWeight: 600 }}>{a.title}</div><div style={{ color: "var(--muted)", fontSize: 13 }}>{a.detail}</div></div>
            <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12.5 }}>{timeAgo(a.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
