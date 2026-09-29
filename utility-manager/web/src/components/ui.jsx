import { Link } from 'react-router-dom';
import { ASSET_STATUS, PROJECT_STATES, SERVICES, SEVERITIES } from '../format.js';

export function Stat({ label, value, sub, tone = '', to }) {
  const body = <><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</>;
  return to ? <Link to={to} className={`stat link ${tone}`}>{body}</Link> : <div className={`stat ${tone}`}>{body}</div>;
}

// Status is always icon + word, never colour alone.
export function AssetStatus({ status }) {
  const s = ASSET_STATUS[status] || ASSET_STATUS.unknown;
  return <span className={`status ${s.tone}`}>{s.icon} {s.label}</span>;
}

export function Severity({ value }) {
  return <span className={`sev ${value}`}>{SEVERITIES[value] || value}</span>;
}

export function ProjectState({ value }) {
  return <span className={`pill state-${value}`}>{PROJECT_STATES[value] || value}</span>;
}

export function Service({ value, short }) {
  const s = SERVICES[value];
  if (!s) return value;
  return <span className={`svc ${value}`} title={s.label}>{s.icon}{!short && ` ${s.label}`}</span>;
}

export function Progress({ value }) {
  return (
    <span className="progress" title={`${value}%`}>
      <span className="progress-track"><span className="progress-bar" style={{ width: `${value}%` }} /></span>
      <span>{value}%</span>
    </span>
  );
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <header className="card-head"><h2>{title}</h2>{actions && <div className="actions">{actions}</div>}</header>}
      {children}
    </section>
  );
}

export function PageHead({ title, crumbs, actions, children }) {
  return (
    <div className="page-head">
      {crumbs && <nav className="crumbs">{crumbs.map((c, i) => <span key={i}>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}{i < crumbs.length - 1 && ' › '}</span>)}</nav>}
      <div className="page-title"><h1>{title}</h1>{actions && <div className="actions">{actions}</div>}</div>
      {children}
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="error" role="alert">{error.message || String(error)}</div>;
}

export function Loading({ what = '' }) {
  return <p className="muted">Loading{what && ` ${what}`}…</p>;
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

// Loading / error / content in one place.
export function Async({ state, children }) {
  if (state.error) return <ErrorBox error={state.error} />;
  if (!state.data) return <Loading />;
  return children(state.data);
}

export function Field({ label, hint, children, wide }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function Select({ value, onChange, options, placeholder, ...rest }) {
  const entries = Array.isArray(options) ? options : Object.entries(options);
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {entries.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}

export function Pager({ page, onOffset }) {
  if (!page || page.total <= page.limit) return page ? <p className="muted small">{page.total} record{page.total === 1 ? '' : 's'}</p> : null;
  const { total, limit, offset } = page;
  return (
    <div className="pager">
      <span className="muted small">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
      <button className="btn ghost" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - limit))}>‹ Previous</button>
      <button className="btn ghost" disabled={offset + limit >= total} onClick={() => onOffset(offset + limit)}>Next ›</button>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="card-head"><h2>{title}</h2><button className="btn ghost" onClick={onClose} aria-label="Close">✕</button></header>
        {children}
      </div>
    </div>
  );
}
