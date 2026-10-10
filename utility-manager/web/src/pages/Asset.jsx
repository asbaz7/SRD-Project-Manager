// One asset. For a genset this is the engine record: condition from the
// latest report, overhaul and alternator figures, ongoing work and the full
// maintenance history.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AssetForm } from '../components/forms.jsx';
import { AssetStatus, Async, Card, Condition, Empty, ErrorBox, Field, Modal, PageHead, Select, Service, Severity, WorkState } from '../components/ui.jsx';
import { ASSET_KINDS, ASSET_STATUS, EVENT_KINDS, INCIDENT_CATEGORIES, SERVICES, WORK_KINDS, date, dateTime, localDate, month, num, withUnit } from '../format.js';
import { useApi, useSubmit } from '../hooks.js';

const ago = (iso) => {
  if (!iso) return '';
  const months = Math.round((Date.now() - Date.parse(`${iso}T00:00:00Z`)) / (30.44 * 86400000));
  return months < 1 ? 'this month' : months < 24 ? `${months} month${months === 1 ? '' : 's'} ago` : `${Math.round(months / 12)} years ago`;
};

export default function Asset() {
  const { id } = useParams();
  const state = useApi(`/assets/${id}`);
  const { can } = useAuth();
  const [modal, setModal] = useState(null);
  const [editEvent, setEditEvent] = useState(null);
  const done = () => { setModal(null); state.reload(); };

  return <Async state={state}>{(a) => {
    const manage = can('manager') && a.can_edit;
    const isEngine = a.kind === 'genset';
    const c = a.condition;
    const e = a.engine || {};
    const openWork = a.work.filter((w) => !['completed', 'cancelled'].includes(w.status));
    return <>
      <PageHead title={`${a.atoll_code} · ${a.island_name} · ${ASSET_KINDS[a.kind]} ${a.tag}`}
        crumbs={[{ to: `/${a.service}${isEngine ? '/engines' : ''}`, label: isEngine ? 'Engines' : SERVICES[a.service]?.label || 'Assets' }, { to: `/islands/${a.island_id}`, label: `${a.atoll_code} · ${a.island_name}` }, { label: `${ASSET_KINDS[a.kind]} ${a.tag}` }]}
        actions={manage && <>
          <button className="btn" onClick={() => setModal('status')}>Update status</button>
          <Link className="btn" to={`/work/new?asset_id=${a.id}`}>Log work</Link>
          {isEngine && <button className="btn" onClick={() => setModal('event')}>Add maintenance record</button>}
          {!a.work.some((w) => w.kind === 'relocation' && !['completed', 'cancelled'].includes(w.status))
            && <Link className="btn ghost" to={`/work/new?kind=relocation&asset_id=${a.id}`}>Move</Link>}
          <button className="btn ghost" onClick={() => setModal('edit')}>Edit details</button>
        </>}>
        {a.work.filter((w) => w.kind === 'relocation' && !['completed', 'cancelled'].includes(w.status)).map((w) => (
          <div key={w.id} className="notice">🚚 Being moved: <WorkState value={w.status} /> · <Link to={`/work/${w.id}`}>{w.ref} {w.title}</Link></div>
        ))}
        <p className="muted">{a.make_model || '—'}{a.rated_capacity ? ` · ${num(a.rated_capacity)} ${a.capacity_unit || ''}` : ''}{a.serial_no ? ` · S/N ${a.serial_no}` : ''}</p>
      </PageHead>

      {isEngine && <div className="panels">
        <Card title="Condition">
          {/* One current state, then labelled facts: why, where it came from,
              and what the last report said when that differs. */}
          <div className="big"><Condition value={c?.condition} /></div>
          {(() => {
            const fromStatus = c?.condition_source === 'status';
            const why = fromStatus ? c.condition_note : c?.fault;
            return <dl className="facts condition-facts">
              {why && <><dt>{fromStatus && a.status !== 'down' ? 'Note' : 'Fault'}</dt><dd>{why}</dd></>}
              {fromStatus && <>
                <dt>Source</dt><dd>Status update · {dateTime(c.condition_at)}{a.status_by_name && ` · ${a.status_by_name}`}</dd>
                {c.report_month && <><dt>Last report</dt><dd className="muted">{month(c.report_month)}: <Condition value={c.report_condition} text={c.status_text} />{c.fault && ` · ${c.fault}`}</dd></>}
              </>}
              {!fromStatus && c?.report_month && <>
                <dt>Source</dt><dd>{month(c.report_month)} report{c.uploaded_by_name && ` · uploaded by ${c.uploaded_by_name}`}</dd>
                {c.status_text && <><dt>Report says</dt><dd className="muted">{c.status_text}</dd></>}
              </>}
              {!c && <><dt>Source</dt><dd className="muted">No condition report uploaded yet</dd></>}
            </dl>;
          })()}
          <p className={`small ${e.report_stale ? 'bad' : 'muted'}`}>
            {e.report_stale ? '⚠ A newer monthly report is due. ' : c?.condition_source === 'status' ? 'The next monthly report will update this. ' : ''}
            <Link to="/electricity/reports">Upload report</Link>
          </p>
        </Card>

        <Card title="Overhaul">
          <div className="big">{e.hours_since_overhaul != null ? `${num(e.hours_since_overhaul)} h` : '—'}</div>
          <p className="muted small">running hours since last overhaul</p>
          <dl className="facts small">
            <dt>Last overhaul</dt><dd>{date(e.last_overhaul_on)} <span className="muted">{ago(e.last_overhaul_on)}</span></dd>
            <dt>Total hours</dt><dd>{num(c?.total_hours)}{e.hours_per_month ? <span className="muted"> · ≈{num(e.hours_per_month)} h/month</span> : ''}</dd>
            <dt>Next overhaul</dt><dd>{e.hours_to_overhaul != null || a.next_overhaul_on
              ? <>{a.next_overhaul_hours != null && `at ${num(a.next_overhaul_hours)} h`}{a.next_overhaul_on && ` · by ${date(a.next_overhaul_on)}`}
                {e.hours_to_overhaul != null && <span className={e.hours_to_overhaul <= 0 ? 'bad' : ''}>{a.next_overhaul_hours != null || a.next_overhaul_on ? ' (' : ''}{e.hours_to_overhaul <= 0 ? `${num(-e.hours_to_overhaul)} h overdue` : `in ${num(e.hours_to_overhaul)} h${e.hours_per_month ? `, ≈${Math.max(1, Math.round(e.hours_to_overhaul / e.hours_per_month))} months` : ''}`}{a.next_overhaul_hours != null || a.next_overhaul_on ? ')' : ''}</span>}
                {e.overhaul_rule === 'interval' && <><br /><small className="muted">every {num(e.intervals.overhaul_hours)} h{e.intervals.model_match ? ` (${e.intervals.model_match})` : ''}</small></>}</>
              : <span className="muted">Not known: no hours since overhaul</span>}</dd>
          </dl>
          {(c?.needs_overhaul || e.overhaul_due) && <p className="flag bad">Overhaul needed{c?.needs_overhaul ? ' · requested on the latest report' : ' · by hours'}</p>}
          {c?.overhaul_spares_received != null && <p className="small">Spares received: {c.overhaul_spares_received ? 'Yes' : 'No'}</p>}
        </Card>

        <Card title="Alternator">
          <div className="big">{date(e.last_alt_service_on)}</div>
          <p className="muted small">last service {ago(e.last_alt_service_on)}</p>
          <dl className="facts small">
            <dt>Make</dt><dd>{a.alt_make || '—'}{a.alt_kw ? ` · ${num(a.alt_kw)} kW` : ''}</dd>
            <dt>Serial / frame</dt><dd>{[a.alt_serial, a.alt_frame].filter(Boolean).join(' · ') || '—'}</dd>
            <dt>Next service</dt><dd>{e.next_alt_service_due ? <>{date(e.next_alt_service_due)}<br /><small className="muted">{e.alt_service_rule === 'set'
              ? 'set on this genset' : `${e.intervals.alt_service_months} months after the last${e.intervals.model_match ? ` (${e.intervals.model_match})` : ''}`}</small></>
              : <span className="muted">Not known: no service recorded</span>}</dd>
          </dl>
          {e.alt_service_due && <p className="flag warn">Service needed{e.alt_requested ? ' · requested on the latest report' : ' · by date'}</p>}
        </Card>

        <Card title="Other">
          <dl className="facts small">
            <dt>Valve clearance</dt><dd>{date(c?.last_valve_on)}{c?.hours_since_valve != null && <span className="muted"> · {num(c.hours_since_valve)} h since</span>}</dd>
            <dt>Battery changed</dt><dd>{date(c?.last_battery_on)}</dd>
            <dt>Max load this month</dt><dd>{withUnit(c?.max_load_kw, 'kW')}{c?.capable_kw ? <span className="muted"> of {num(c.capable_kw)} kW possible</span> : ''}</dd>
            <dt>Installed</dt><dd>{date(a.commissioned_on)}</dd>
            {a.moves?.[0] && <><dt>Moved here</dt><dd>{date(a.moves[0].moved_on)} <span className="muted">from {a.moves[0].from_atoll}. {a.moves[0].from_island}</span></dd></>}
            <dt>Fixed asset code</dt><dd>{a.fixed_asset_code || '—'}</dd>
            <dt>Connected to panel</dt><dd>{a.connected_to_panel == null ? '—' : a.connected_to_panel ? 'Yes' : 'No'}</dd>
          </dl>
        </Card>
      </div>}

      {!isEngine && <Card title="Details">
        <dl className="facts">
          <dt>Status</dt><dd><AssetStatus status={a.status} />{a.status_note && <div className="muted small">{a.status_note}</div>}</dd>
          <dt>Service</dt><dd><Service value={a.service} /></dd>
          <dt>Rated capacity</dt><dd>{withUnit(a.rated_capacity, a.capacity_unit || '')}</dd>
          <dt>Commissioned</dt><dd>{date(a.commissioned_on)}</dd>
          {a.notes && <><dt>Notes</dt><dd className="pre">{a.notes}</dd></>}
        </dl>
      </Card>}

      <Card title={`Work${openWork.length ? ` · ${openWork.length} ongoing` : ''}`} actions={manage && <Link className="btn small" to={`/work/new?asset_id=${a.id}`}>Log work</Link>}>
        {a.work.length === 0 ? <Empty>No work recorded on this {ASSET_KINDS[a.kind].toLowerCase()}.</Empty> :
          <table><tbody>{a.work.map((w) => <tr key={w.id}>
            <td className="wrap"><Link to={`/work/${w.id}`}><strong>{w.title}</strong></Link><br />
              <small className="muted">{w.ref} · {WORK_KINDS[w.kind]}{w.assigned_to && ` · ${w.assigned_to}`} · {w.completed_on ? `completed ${date(w.completed_on)}` : `started ${date(w.started_on)}`}</small>
              {w.last_update && <div className="small">{w.last_update}</div>}</td>
            <td><WorkState value={w.status} /></td>
          </tr>)}</tbody></table>}
      </Card>

      {a.moves?.length > 0 && <Card title="Moves">
        <table><tbody>{a.moves.map((m) => <tr key={m.id}>
          <td className="nowrap small">{date(m.moved_on)}</td>
          <td className="wrap"><strong>{m.from_atoll}. {m.from_island} · {ASSET_KINDS[a.kind]} {m.from_tag}</strong> → <strong>{m.to_atoll}. {m.to_island} · {ASSET_KINDS[a.kind]} {m.to_tag}</strong>
            {m.notes && !/^WO-\d+$/.test(m.notes) && <><br /><small className="muted">{m.notes}</small></>}</td>
          <td className="small muted nowrap">{m.work_id && <><Link to={`/work/${m.work_id}`}>WO-{String(m.work_id).padStart(4, '0')}</Link><br /></>}{m.source === 'report' ? 'From condition report' : m.moved_by_name}</td>
        </tr>)}</tbody></table>
      </Card>}
      {isEngine && <Card title="Maintenance history" actions={manage && <button className="btn small" onClick={() => setModal('event')}>Add record</button>}>
        {a.maintenance.length === 0 ? <Empty>No maintenance recorded yet. Uploading condition reports fills this in automatically.</Empty> :
          <table>
            <thead><tr><th>Date</th><th>What</th><th className="num hide-sm">At hours</th><th className="hide-sm">Source</th><th /></tr></thead>
            <tbody>{a.maintenance.map((m) => <tr key={m.id}>
              <td className="nowrap">{date(m.done_on)}</td>
              <td className="wrap"><strong>{EVENT_KINDS[m.kind]}</strong>{m.notes && <div className="small">{m.notes}</div>}
                {m.edited_at && <div className="small muted" title={m.edit_reason || ''}>Edited {date(m.edited_at)}{m.edited_by_name && ` by ${m.edited_by_name}`}{m.edit_reason && `: ${m.edit_reason}`}</div>}</td>
              <td className="num hide-sm">{num(m.running_hours)}</td>
              <td className="hide-sm small muted">{m.source === 'report' ? (m.origin === 'fleet_manager' ? 'Condition report · Fleet Manager' : 'Condition report') : m.source === 'work' ? <Link to={`/work/${m.work_id}`}>{m.work_ref}</Link> : `Added by ${m.created_by_name || '—'}`}</td>
              <td className="nowrap">{manage && m.source !== 'report' && <button className="btn ghost small" onClick={() => setEditEvent(m)} aria-label="Edit record">Edit</button>}
                {manage && (m.source === 'manual' || can('admin')) && <DeleteEvent id={m.id} onDone={state.reload} />}</td>
            </tr>)}</tbody>
          </table>}
      </Card>}

      {isEngine && <ReportHistory assetId={a.id} />}

      {isEngine && a.hours_log.length > 1 && <Card title="Running hours by month">
        <table><tbody><tr>{a.hours_log.map((h) => <td key={h.month} className="num small"><span className="muted">{month(h.month)}</span><br />{num(h.total_hours)}</td>)}</tr></tbody></table>
      </Card>}

      <div className="grid-2">
        <Card title="Status history">
          {a.history.length === 0 ? <Empty>No status reported yet.</Empty> :
            <div className="scroll-y"><table><tbody>{a.history.map((h) => <tr key={h.id}>
              <td className="nowrap small">{dateTime(h.reported_at)}</td><td><AssetStatus status={h.status} /></td>
              <td className="wrap small">{h.note || '—'}<br /><span className="muted">{h.reported_by_name}</span></td>
            </tr>)}</tbody></table></div>}
        </Card>
        <Card title="Incidents">
          {a.incidents.length === 0 ? <Empty>No incidents linked.</Empty> :
            <table><tbody>{a.incidents.map((x) => <tr key={x.id}>
              <td><Severity value={x.severity} /></td>
              <td className="wrap"><Link to={`/incidents/${x.id}`}>{x.title}</Link><br /><small className="muted">{INCIDENT_CATEGORIES[x.category]} · {dateTime(x.started_at)} · {x.status}</small></td>
            </tr>)}</tbody></table>}
        </Card>
      </div>

      {modal === 'edit' && <AssetForm asset={a} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'status' && <StatusForm asset={a} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'event' && <EventForm asset={a} onClose={() => setModal(null)} onSaved={done} />}
      {editEvent && <EventForm asset={a} event={editEvent} onClose={() => setEditEvent(null)} onSaved={() => { setEditEvent(null); state.reload(); }} />}
    </>;
  }}</Async>;
}

// Every monthly report received for this engine, newest first. When Fleet
// Manager and an uploaded sheet both gave a month, both rows show and the
// figures that disagree are marked.
const REPORT_COLS = [
  ['status_text', 'Report says'], ['total_hours', 'Hours', num], ['last_overhaul_on', 'Overhaul', date],
  ['last_alt_service_on', 'Alternator', date], ['last_valve_on', 'Valves', date], ['last_battery_on', 'Battery', date],
];
function ReportHistory({ assetId }) {
  const state = useApi(`/condition-reports/history?asset_id=${assetId}`);
  const rows = state.data?.engines || [];
  if (!rows.length) return null;
  const byMonth = Object.groupBy ? Object.groupBy(rows, (r) => r.report_month) : rows.reduce((m, r) => ({ ...m, [r.report_month]: [...(m[r.report_month] || []), r] }), {});
  const differs = (r, k) => (byMonth[r.report_month] || []).some((o) => o !== r && String(o[k] ?? '') !== String(r[k] ?? ''));
  return <Card title="Reports by month">
    <div className="scroll-y"><table>
      <thead><tr><th>Month</th><th>Condition</th>{REPORT_COLS.map(([k, label]) => <th key={k} className={k === 'status_text' ? 'hide-sm' : 'num hide-sm'}>{label}</th>)}<th className="hide-sm">From</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={`${r.report_month}${r.source}`}>
        <td className="nowrap">{month(r.report_month)}</td>
        <td className={differs(r, 'condition') ? 'differs' : ''}><Condition value={r.condition} />{r.fault && <div className="small wrap">{r.fault}</div>}</td>
        {REPORT_COLS.map(([k, , f]) => <td key={k} className={`${k === 'status_text' ? 'small wrap' : 'num nowrap'} hide-sm ${differs(r, k) ? 'differs' : ''}`}>{r[k] == null ? '—' : f ? f(r[k]) : r[k]}</td>)}
        <td className="small muted hide-sm nowrap">{r.source === 'fleet_manager' ? 'Fleet Manager' : 'Upload'}</td>
      </tr>)}</tbody>
    </table></div>
    {rows.some((r) => REPORT_COLS.some(([k]) => differs(r, k)) || differs(r, 'condition')) && <p className="muted small">Highlighted: Fleet Manager and the uploaded sheet disagree for that month.</p>}
  </Card>;
}

function StatusForm({ asset, onClose, onSaved }) {
  const [s, setS] = useState({ status: asset.status === 'unknown' ? '' : asset.status, note: '' });
  const { submit, busy, error } = useSubmit(async () => {
    await api('/assets/status', { method: 'POST', body: { items: [{ asset_id: asset.id, status: s.status, note: s.note || null }] } });
    onSaved();
  });
  return <Modal title={`Status of ${ASSET_KINDS[asset.kind]} ${asset.tag}`} onClose={onClose}>
    <form className="form narrow" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <ErrorBox error={error} />
      <Field label="Status"><Select required value={s.status} onChange={(v) => setS({ ...s, status: v })} placeholder="Choose…"
        options={Object.entries(ASSET_STATUS).filter(([k]) => k !== 'unknown').map(([k, x]) => [k, x.label])} /></Field>
      <Field label="Note"><input value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} placeholder="e.g. awaiting turbocharger" /></Field>
      <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
    </form>
  </Modal>;
}

// Adds a record, or corrects one (`event`) with a reason for the audit trail.
// A completed work order's record takes its date and type from the work order.
function EventForm({ asset, event, onClose, onSaved }) {
  const [f, setF] = useState(event
    ? { kind: event.kind, done_on: event.done_on, running_hours: event.running_hours ?? '', notes: event.notes || '', reason: '' }
    : { kind: 'overhaul', done_on: localDate(0), running_hours: asset.condition?.total_hours ?? '', notes: '' });
  const fromWork = event?.source === 'work' && event.work_id;
  const { submit, busy, error } = useSubmit(async () => {
    const body = { running_hours: f.running_hours === '' ? null : Number(f.running_hours), notes: f.notes || null };
    if (!fromWork) Object.assign(body, { kind: f.kind, done_on: f.done_on });
    if (event) await api(`/maintenance/${event.id}`, { method: 'PATCH', body: { ...body, reason: f.reason } });
    else await api(`/assets/${asset.id}/maintenance`, { method: 'POST', body });
    onSaved();
  });
  return <Modal title={`${event ? 'Edit maintenance record' : 'Maintenance record'} · ${ASSET_KINDS[asset.kind]} ${asset.tag}`} onClose={onClose}>
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <ErrorBox error={error} />
      {fromWork && <p className="muted small wide">The date and type come from <Link to={`/work/${event.work_id}`}>{event.work_ref}</Link>. To change them, or move the record to another engine, edit the work order.</p>}
      <Field label="What was done"><Select value={f.kind} disabled={!!fromWork} onChange={(v) => setF({ ...f, kind: v })} options={EVENT_KINDS} /></Field>
      <Field label="Date"><input type="date" required disabled={!!fromWork} max={localDate(0)} value={f.done_on} onChange={(e) => setF({ ...f, done_on: e.target.value })} /></Field>
      <Field label="At running hours (optional)"><input type="number" min="0" step="any" value={f.running_hours} onChange={(e) => setF({ ...f, running_hours: e.target.value })} /></Field>
      <Field label="Notes" wide><textarea rows="3" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Parts replaced, contractor, findings…" /></Field>
      {event ? <Field label="Reason for the change" wide hint="Kept with the record and in the audit trail.">
        <input required maxLength="500" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Date typed wrong; job card says 14 Sept" /></Field>
        : <p className="muted small wide">Use this for work done before the system, or not covered by a report. Ongoing jobs are better logged as Work.</p>}
      <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{event ? 'Save changes' : 'Save record'}</button></div>
    </form>
  </Modal>;
}

function DeleteEvent({ id, onDone }) {
  const { submit, busy } = useSubmit(async () => {
    if (!window.confirm('Remove this maintenance record?')) return;
    await api(`/maintenance/${id}`, { method: 'DELETE' });
    onDone();
  });
  return <button className="btn ghost small" disabled={busy} onClick={submit} aria-label="Remove record">✕</button>;
}
