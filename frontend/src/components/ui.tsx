import React, { useEffect, useState } from "react";

export const Badge = ({ status, children }: { status?: string; children?: React.ReactNode }) => {
  const cls = `b-${(status || "info").toLowerCase().replace(/[^a-z]/g, "")}`;
  return <span className={`badge ${cls}`}><span className="dot" />{children ?? status}</span>;
};

export const Skeleton = ({ h = 14, w = "100%" }: { h?: number; w?: string | number }) => (
  <div className="skeleton" style={{ height: h, width: w }} />
);

export function SkeletonCard() {
  return <div className="card"><Skeleton h={12} w="40%" /><div style={{ height: 10 }} /><Skeleton h={30} w="70%" /><div style={{ height: 10 }} /><Skeleton h={12} /></div>;
}

export const EmptyState = ({ icon = "◍", title, body, action }: { icon?: string; title: string; body?: string; action?: React.ReactNode }) => (
  <div className="empty">
    <div className="empty-art">{icon}</div>
    <h3 style={{ margin: "0 0 6px", color: "var(--ink)" }}>{title}</h3>
    {body && <p style={{ margin: "0 0 14px" }}>{body}</p>}
    {action}
  </div>
);

export const LoadError = ({ message, retry }: { message: string; retry: () => void }) => (
  <div className="card">
    <EmptyState
      icon="⚠"
      title="Couldn't load data"
      body={message}
      action={<button className="btn btn-primary btn-sm" onClick={retry}>↻ Retry</button>}
    />
  </div>
);

// Toasts
let pushToast: ((msg: string) => void) | null = null;
export function toast(msg: string) { pushToast?.(msg); }
export function ToastHost() {
  const [items, setItems] = useState<Array<{ id: number; msg: string }>>([]);
  useEffect(() => {
    pushToast = (msg) => {
      const id = Date.now() + Math.random();
      setItems((s) => [...s, { id, msg }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3400);
    };
  }, []);
  return <div className="toasts">{items.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}</div>;
}

// Animated circular cursor (desktop only)
export function Cursor() {
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const dot = document.createElement("div");
    const ring = document.createElement("div");
    dot.className = "cursor-dot"; ring.className = "cursor-ring";
    document.body.append(dot, ring);
    let x = -100, y = -100, rx = -100, ry = -100;
    let raf = 0;
    let scale = 1, targetScale = 1;
    const onMove = (e: MouseEvent) => {
      x = e.clientX; y = e.clientY;
      const t = e.target as HTMLElement;
      const hovering = !!t.closest("a,button,.chip,.card.hoverable,input,select,textarea");
      ring.classList.toggle("is-hover", hovering);
    };
    const onDown = () => { targetScale = 0.8; };
    const onUp = () => { targetScale = 1; };
    const onLeave = () => { dot.style.opacity = "0"; ring.style.opacity = "0"; };
    const onEnter = () => { dot.style.opacity = "1"; ring.style.opacity = ""; };
    const loop = () => {
      rx += (x - rx) * 0.22; ry += (y - ry) * 0.22;
      scale += (targetScale - scale) * 0.3;
      dot.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${scale})`;
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%) scale(${scale})`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.documentElement.addEventListener("mouseenter", onEnter);
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mousedown", onDown); window.removeEventListener("mouseup", onUp); document.documentElement.removeEventListener("mouseleave", onLeave); document.documentElement.removeEventListener("mouseenter", onEnter); cancelAnimationFrame(raf); dot.remove(); ring.remove(); };
  }, []);
  return null;
}

export function Modal({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={wide ? { maxWidth: 860 } : undefined} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
