import Link from "next/link";
import { titleCase } from "@/lib/format";

export function PageHeader({ eyebrow, title, description, actions }) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}
export function Card({ children, className = "" }) { return <section className={`card ${className}`}>{children}</section>; }
export function Stat({ label, value, hint, tone = "" }) { return <div className={`stat ${tone}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>; }
export function Badge({ children, tone = "" }) { return <span className={`badge ${tone}`}>{children}</span>; }
export function Progress({ value = 0 }) { const v = Math.max(0, Math.min(100, Number(value || 0))); return <div className="progress"><span style={{ width: `${v}%` }} /></div>; }
export function StatusBadge({ status }) { return <Badge tone={`status-${status}`}>{titleCase(status)}</Badge>; }
export function PriorityBadge({ priority }) { return <Badge tone={`priority-${priority}`}>{titleCase(priority)}</Badge>; }
export function Empty({ title, children }) { return <div className="empty"><strong>{title}</strong>{children && <p>{children}</p>}</div>; }
export function LinkButton({ href, children, secondary = false }) { return <Link href={href} className={`btn ${secondary ? "secondary" : "primary"}`}>{children}</Link>; }
