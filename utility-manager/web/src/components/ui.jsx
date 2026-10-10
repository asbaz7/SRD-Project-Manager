import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from './icons.jsx';
import { ASSET_STATUS, CONDITIONS, PROJECT_STATES, SERVICES, SEVERITIES, WORK_STATES, date, month } from '../format.js';

export function Stat({ label, value, sub, tone = '', to }) {
  const body = <><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</>;
  return to ? <Link to={to} className={`stat link ${tone}`}>{body}</Link> : <div className={`stat ${tone}`}>{body}</div>;
}

// Status is always icon + word, never colour alone.
export function AssetStatus({ status }) {
  const s = ASSET_STATUS[status] || ASSET_STATUS.unknown;
  return <span className={`status ${s.tone}`}>{s.icon} {s.label}</span>;
}

export function Condition({ value, text }) {
  const c = CONDITIONS[value];
  if (!c) return <span className="status none">– No report</span>;
  return <span className={`status ${c.tone}`} title={text || c.label}>{c.icon} {c.label}</span>;
}

// A genset's current state: one answer, from whichever is newer of the
// monthly report and the last status update (see engine_current in the
// database). The second line says where it came from.
export function EngineState({ e, compact = false }) {
  const fromStatus = e.condition_source === 'status';
  const text = fromStatus ? e.condition_note : (e.status_text || e.report_status);
  return <>
    <Condition value={e.condition} text={text} />
    {!compact && (fromStatus
      ? <><br /><small className="muted" title={`The ${month(e.report_month) || 'last'} report said: ${CONDITIONS[e.report_condition]?.label || 'no report'}`}>
          {e.status === 'maintenance' ? 'In maintenance' : e.status === 'down' ? 'Set down' : 'Back in service'} {date(e.condition_at)}</small></>
      : e.condition && e.status && !['running', 'unknown'].includes(e.status) && e.condition !== 'not_running'
        ? <><br /><AssetStatus status={e.status} /></> : null)}
  </>;
}

export function WorkState({ value }) {
  return <span className={`pill work-${value}`}>{WORK_STATES[value] || value}</span>;
}

// Small labelled flags shown next to an engine.
export function Flags({ e }) {
  const flags = [];
  // "requested" = the island ticked it on its sheet; otherwise due by rule.
  if (e.overhaul_due || e.needs_overhaul) flags.push(['bad', 'Overhaul due', e.needs_overhaul ? 'Island requested on its report' : 'Due by hours since overhaul']);
  if (e.alt_service_due || e.alt_needs_service) flags.push(['warn', `Alternator service${e.alt_needs_service ? ' · requested' : ''}`, e.alt_needs_service ? 'Island requested on its report' : `Due since ${e.next_alt_service_due || '—'}`]);
  for (const w of e.open_work || []) flags.push(['info', `🔧 ${w.title}`]);
  if (!flags.length) return null;
  return <span className="flags">{flags.map(([tone, t, why], i) => <span key={i} className={`flag ${tone}`} title={why}>{t}</span>)}</span>;
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
  return <span className="svc" title={s.label}><span className={`svc-dot ${value}`} aria-hidden="true" />{short ? null : s.label}</span>;
}

// Engine conditions as one stacked bar plus a legend that doubles as links.
// Status colours with labels and counts, so colour never stands alone.
export function ConditionMeter({ e, link = (k) => `/electricity/engines?condition=${k}` }) {
  const parts = [
    ['ok', 'OK', e.ok, 'ok', 'var(--good-fill)'], ['minor_fault', 'Minor fault', e.minor_fault, 'warn', 'var(--warn-fill)'],
    ['major_fault', 'Major fault', e.major_fault, 'serious', 'var(--serious-fill)'], ['not_running', 'Not running', e.not_running, 'bad', 'var(--bad-fill)'],
    ['no_report', 'No report', e.no_report, 'none', 'var(--none-fill)'],
  ];
  const total = e.total || 1;
  return <>
    <div className="meter" role="img" aria-label={parts.map(([, l, n]) => `${n} ${l}`).join(', ')}>
      {parts.filter(([, , n]) => n > 0).map(([k, l, n, tone]) => <span key={k} className={tone} style={{ width: `${(100 * n) / total}%` }} title={`${l}: ${n} of ${e.total} engines`} />)}
    </div>
    <div className="legend">{parts.map(([k, l, n, , fill]) => (
      <Link key={k} to={link(k)}><i style={{ background: fill }} />{l}<strong>{n}</strong></Link>
    ))}</div>
  </>;
}

export function Progress({ value }) {
  return (
    <span className="progress" title={`${value}%`}>
      <span className="progress-track"><span className="progress-bar" style={{ width: `${value}%` }} /></span>
      <span>{Math.round(Number(value || 0) * 10) / 10}%</span>
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

export function PageHead({ title, crumbs, actions, children, icon, tone = 'neutral', subtitle }) {
  return (
    <div className="page-head">
      {crumbs && <nav className="crumbs">{crumbs.map((c, i) => <span key={i}>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}{i < crumbs.length - 1 && ' › '}</span>)}</nav>}
      <div className="page-title">
        {icon && <span className={`title-icon ${tone}`}><Icon name={icon} size={24} /></span>}
        <div><h1>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}</div>
        {actions && <div className="actions">{actions}</div>}
      </div>
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

// Drawn at page level (a portal): inside a glass card, the card's blur would
// trap a fixed-position pop-up within the card, and clicks inside the pop-up
// would land on the backdrop and close it.
export function Modal({ title, onClose, children }) {
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="card-head"><h2>{title}</h2><button className="btn ghost" onClick={onClose} aria-label="Close">✕</button></header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
