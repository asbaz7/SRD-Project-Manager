import { kw } from "@/lib/data";

export function Stat({ label, value }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
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
