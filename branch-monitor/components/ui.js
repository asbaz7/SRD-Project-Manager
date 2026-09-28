import { kw } from "@/lib/data";

export function Stat({ label, value, tone = "" }) {
  return <div className={`stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

// Installed-capacity bar, scaled against the largest row in the same table.
export function CapacityBar({ value, max }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="bar-cell" title={kw(value)}>
      <div className="bar-track"><div className="bar" style={{ width: `${width}%` }} /></div>
      <span>{kw(value)}</span>
    </div>
  );
}

// Running status: icon + label, never colour alone.
export function Status({ running }) {
  if (running === true) return <span className="status ok">● Running</span>;
  if (running === false) return <span className="status down">✕ Not running</span>;
  return <span className="status none">– No status</span>;
}

export function ProjectStatus({ status }) {
  return <span className={`pill ${status === "On hold" ? "hold" : ""}`}>{status}</span>;
}

export function SheetNotice({ ok }) {
  if (ok) return null;
  return <p className="notice">Genset status and projects couldn't be loaded from the shared Google Sheet right now.</p>;
}

// "3 of 5 running · 2 down" summary for a group of gensets.
export function RunningSummary({ running, stopped, total }) {
  if (running + stopped === 0) return <span className="muted">No status</span>;
  return <>
    {running} of {total} running
    {stopped > 0 && <span className="status down"> · ✕ {stopped} down</span>}
  </>;
}
