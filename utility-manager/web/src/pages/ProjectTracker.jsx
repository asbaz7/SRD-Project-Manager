// A project's task tracker (first for the Powerhouse Takeover): the Excel
// tracker's Summary, its task list with P1 tasks first, and per site the
// systems to get access to and the diesel, safety PPE and stationery
// checklists. Everything is updated one row at a time.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, Modal, Progress, Select, Stat } from '../components/ui.jsx';
import { ACCESS_STATUSES, AVAILABILITY, CHECKLISTS, DEPARTMENTS, PRIORITIES, TASK_STATUSES, date, num, pct } from '../format.js';
import { useApi, useFilters, useSubmit } from '../hooks.js';

const OPEN = (t) => !['Completed', 'Cancelled'].includes(t.status);
const statusOf = (t) => t.status || 'Not Started';

export function TaskStatus({ value }) {
  const s = TASK_STATUSES[value || 'Not Started'];
  return <span className={`pill task-${s.key}`}>{value || 'Not Started'}</span>;
}

export function PriorityBadge({ value }) {
  if (!value) return null;
  return <span className={`prio p${value}`} title={PRIORITIES[value]}>P{value}</span>;
}

// --- Tracker: summary and tasks ---------------------------------------------

export function Tracker({ project: p, reload }) {
  const { user } = useAuth();
  const [filters, setFilter] = useFilters();
  const [open, setOpen] = useState(null);
  const tasks = p.tasks;

  const counted = tasks.filter((t) => t.status !== 'Cancelled');
  const done = tasks.filter((t) => t.status === 'Completed').length;
  const by = (k, v) => tasks.filter((t) => String(t[k] ?? '') === String(v));
  const overdue = tasks.filter((t) => t.overdue);

  const shown = tasks.filter((t) => (!filters.status || statusOf(t) === filters.status)
    && (!filters.priority || String(t.priority) === filters.priority)
    && (!filters.dept || t.responsible_dept === filters.dept)
    && (!filters.unit || String(t.unit_id) === filters.unit)
    && (!filters.site || t.island_id === filters.site)
    && (!filters.mine || t.assigned_user_id === user.id)
    && (!filters.overdue || t.overdue)
    && (!filters.open || OPEN(t))
    && (!filters.q || `${t.code} ${t.name} ${t.action || ''} ${t.remarks || ''}`.toLowerCase().includes(filters.q.toLowerCase())))
    // P1 first, then the workbook's order.
    .sort((a, b) => (a.priority || 9) - (b.priority || 9) || a.position - b.position);

  const cell = (filter) => () => setFilter({ status: '', priority: '', dept: '', overdue: '', ...filter });
  const grid = (rows, key) => <table className="tracker-grid">
    <thead><tr><th />{Object.keys(TASK_STATUSES).map((s) => <th key={s} className="num">{s}</th>)}<th className="num">Total</th></tr></thead>
    <tbody>{rows.map(([value, label]) => {
      const list = by(key, value);
      return <tr key={value}><th scope="row">{label}</th>
        {Object.keys(TASK_STATUSES).map((s) => {
          const n = list.filter((t) => statusOf(t) === s).length;
          return <td key={s} className="num">{n ? <button className="link" onClick={cell({ [key === 'priority' ? 'priority' : 'dept']: String(value), status: s })}>{n}</button> : <span className="muted">·</span>}</td>;
        })}
        <td className="num"><strong>{list.length || ''}</strong></td></tr>;
    })}</tbody>
  </table>;

  const units = [...new Map(tasks.filter((t) => t.unit_id).map((t) => [String(t.unit_id), t.unit_name])).entries()];
  const sites = [...new Map(tasks.filter((t) => t.island_id).map((t) => [t.island_id, `${t.atoll_code} · ${t.island_name}`])).entries()];
  const depts = DEPARTMENTS.filter((d) => by('responsible_dept', d).length);

  return <>
    <div className="stats">
      <Stat label="Total tasks" value={tasks.length} sub={`${counted.length} not cancelled`} />
      <Stat label="Completed" value={done} sub={`${pct(counted.length ? (done / counted.length) * 100 : 0)} of tasks`}  />
      <Stat label="In progress" value={by('status', 'In Progress').length} sub={`${by('status', 'On Hold').length} on hold`} />
      <Stat label="Not started" value={tasks.filter((t) => statusOf(t) === 'Not Started').length}
        sub={`${tasks.filter((t) => t.priority === 1 && statusOf(t) === 'Not Started').length} of them P1`} />
      <Stat label="Overdue" value={overdue.length} tone={overdue.length ? 'alert' : ''} />
      <Stat label="Overall progress" value={pct(p.progress_pct)} sub="Average of the tasks, cancelled left out" />
    </div>
    <div className="grid-2">
      <Card title="By priority">{grid(Object.entries(PRIORITIES).map(([k, l]) => [Number(k), `P${k} · ${l}`]), 'priority')}</Card>
      <Card title="By responsible department">{depts.length ? grid(depts.map((d) => [d, d]), 'responsible_dept') : <Empty>No departments set.</Empty>}</Card>
    </div>

    <Card title={`Tasks (${shown.length}${shown.length !== tasks.length ? ` of ${tasks.length}` : ''})`}>
      <div className="filters">
        <input type="search" placeholder="Search tasks…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search tasks" />
        <Select value={filters.status} onChange={(v) => setFilter('status', v)} placeholder="All statuses" options={Object.keys(TASK_STATUSES).map((s) => [s, s])} aria-label="Status" />
        <Select value={filters.priority} onChange={(v) => setFilter('priority', v)} placeholder="All priorities" options={Object.keys(PRIORITIES).map((k) => [k, `P${k}`])} aria-label="Priority" />
        <Select value={filters.dept} onChange={(v) => setFilter('dept', v)} placeholder="All departments" options={DEPARTMENTS.map((d) => [d, d])} aria-label="Responsible department" />
        {units.length > 1 && <Select value={filters.unit} onChange={(v) => setFilter('unit', v)} placeholder="All units" options={units} aria-label="Unit" />}
        {sites.length > 0 && <Select value={filters.site} onChange={(v) => setFilter('site', v)} placeholder="All powerhouses" options={sites} aria-label="Powerhouse" />}
        <div className="chips">
          <button className={`chip ${filters.open ? 'on' : ''}`} onClick={() => setFilter('open', filters.open ? '' : '1')}>Open only</button>
          <button className={`chip ${filters.overdue ? 'on' : ''}`} onClick={() => setFilter('overdue', filters.overdue ? '' : '1')}>Overdue<strong>{overdue.length}</strong></button>
          <button className={`chip ${filters.mine ? 'on' : ''}`} onClick={() => setFilter('mine', filters.mine ? '' : '1')}>Assigned to me</button>
        </div>
      </div>
      {shown.length === 0 ? <Empty>No tasks match these filters.</Empty> : <div className="table-scroll"><table className="tracker-tasks">
        <thead><tr><th>Task</th><th className="hide-sm">Responsible</th><th className="hide-sm">Assigned</th><th>Due</th><th>Status</th><th className="hide-sm">Progress</th></tr></thead>
        <tbody>{shown.map((t) => <tr key={t.id} className={`row-link${t.priority === 1 && OPEN(t) ? ' p1' : ''}`} onClick={() => setOpen(t)}>
          <td className="wrap"><div className="task-title"><PriorityBadge value={t.priority} /><span className="muted small">{t.code}</span></div>
            <button className="link strong" onClick={(e) => { e.stopPropagation(); setOpen(t); }}>{t.name}</button>
            {t.action && <><br /><small className="muted">{t.action}</small></>}
            {t.remarks && <><br /><small>💬 {t.remarks}</small></>}</td>
          <td className="hide-sm small">{t.responsible_dept || '—'}{t.island_name && <><br /><span className="muted">{t.atoll_code} · {t.island_name}</span></>}</td>
          <td className="hide-sm small">{[t.assigned_user_name, t.assigned_to].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
          <td className={`small nowrap ${t.overdue ? 'bad' : ''}`}>{t.due_date ? date(t.due_date) : <span className="muted">—</span>}{t.overdue && <><br />overdue</>}</td>
          <td><TaskStatus value={t.status} />{t.completed_date && <><br /><small className="muted">{date(t.completed_date)}</small></>}</td>
          <td className="hide-sm"><Progress value={t.progress} /></td>
        </tr>)}</tbody>
      </table></div>}
    </Card>
    {open && <TaskForm project={p} task={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); reload(); }} />}
  </>;
}

function TaskForm({ project: p, task: t, onClose, onSaved }) {
  const writable = p.can_edit;
  const islands = useApi(writable ? '/islands' : null);
  const people = useApi(writable ? '/users/directory' : null);
  const units = useApi(writable ? '/units' : null);
  const [f, setF] = useState(() => ({
    name: t.name, action: t.action || '', status: statusOf(t), progress: String(t.progress ?? 0), priority: t.priority ? String(t.priority) : '',
    responsible_dept: t.responsible_dept || '', unit_id: t.unit_id ? String(t.unit_id) : '', island_id: t.island_id || '',
    assigned_user_id: t.assigned_user_id || '', assigned_to: t.assigned_to || '', start_date: t.start_date || '',
    due_date: t.due_date || '', completed_date: t.completed_date || '', remarks: t.remarks || '',
  }));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const { submit, busy, error } = useSubmit(async () => {
    const body = {
      name: f.name, action: f.action || null, status: f.status, progress: Math.min(100, Math.max(0, Number(f.progress) || 0)),
      priority: f.priority ? Number(f.priority) : null, responsible_dept: f.responsible_dept || null, unit_id: f.unit_id ? Number(f.unit_id) : null,
      island_id: f.island_id || null, assigned_user_id: f.assigned_user_id || null, assigned_to: f.assigned_to || null,
      start_date: f.start_date || null, due_date: f.due_date || null, remarks: f.remarks || null,
    };
    // The server dates a task completed today unless a date is given.
    if (f.completed_date !== (t.completed_date || '')) body.completed_date = f.completed_date || null;
    if (f.status === 'Completed' && statusOf(t) !== 'Completed' && Number(f.progress) === Number(t.progress)) delete body.progress;
    await api(`/projects/${p.id}/tasks/${t.id}`, { method: 'PATCH', body });
    onSaved();
  });
  const title = [t.code, t.priority && `P${t.priority} · ${PRIORITIES[t.priority]}`].filter(Boolean).join(' · ') || 'Task';

  if (!writable) {
    return <Modal title={t.code || 'Task'} onClose={onClose}>
      <dl className="facts">
        <dt>Task</dt><dd>{t.name}</dd>
        {t.action && <><dt>Action</dt><dd>{t.action}</dd></>}
        <dt>Priority</dt><dd><PriorityBadge value={t.priority} /> {PRIORITIES[t.priority] || '—'}</dd>
        <dt>Status</dt><dd><TaskStatus value={t.status} /> · {pct(t.progress)}</dd>
        <dt>Responsible</dt><dd>{t.responsible_dept || '—'}{t.unit_name && ` · ${t.unit_name}`}</dd>
        <dt>Powerhouse</dt><dd>{t.island_name ? `${t.atoll_code} · ${t.island_name}` : '—'}</dd>
        <dt>Assigned to</dt><dd>{[t.assigned_user_name, t.assigned_to].filter(Boolean).join(' · ') || '—'}</dd>
        <dt>Dates</dt><dd>Start {date(t.start_date)} · Due {date(t.due_date)}{t.completed_date && ` · Completed ${date(t.completed_date)}`}</dd>
        {t.remarks && <><dt>Remarks</dt><dd className="pre">{t.remarks}</dd></>}
      </dl>
      <p className="muted small">You can view this project. Ask its owner for edit access to update tasks.</p>
    </Modal>;
  }
  return <Modal title={title} onClose={onClose}>
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <ErrorBox error={error} />
      <Field label="Task" wide><textarea required rows="2" maxLength="300" value={f.name} onChange={set('name')} /></Field>
      <Field label="Action to be taken" wide><textarea rows="2" value={f.action} onChange={set('action')} /></Field>
      <Field label="Status"><Select value={f.status} onChange={set('status')} options={Object.keys(TASK_STATUSES).map((s) => [s, s])} /></Field>
      <Field label="Progress (%)" hint={f.status === 'Completed' ? 'Completed counts as 100%' : undefined}>
        <input type="number" min="0" max="100" step="1" value={f.status === 'Completed' && Number(f.progress) < 100 ? '100' : f.progress} disabled={f.status === 'Completed'} onChange={set('progress')} /></Field>
      <Field label="Priority"><Select value={f.priority} onChange={set('priority')} placeholder="—" options={Object.entries(PRIORITIES).map(([k, l]) => [k, `P${k} · ${l}`])} /></Field>
      <Field label="Responsible department"><Select value={f.responsible_dept} onChange={set('responsible_dept')} placeholder="—" options={DEPARTMENTS.map((d) => [d, d])} /></Field>
      <Field label="Unit"><Select value={f.unit_id} onChange={set('unit_id')} placeholder="—" options={(units.data || []).map((u) => [String(u.id), u.name])} /></Field>
      <Field label="Powerhouse / island"><Select value={f.island_id} onChange={set('island_id')} placeholder="All / not specific"
        options={(islands.data || []).filter((i) => (p.sites || []).some((s) => s.island_id === i.id) || i.id === f.island_id).map((i) => [i.id, `${i.atoll_code} · ${i.name}`])} /></Field>
      <Field label="Assigned to (staff)"><Select value={f.assigned_user_id} onChange={set('assigned_user_id')} placeholder="—" options={(people.data || []).map((u) => [u.id, u.full_name])} /></Field>
      <Field label="Assigned to (other)" hint="Someone outside the system"><input maxLength="200" value={f.assigned_to} onChange={set('assigned_to')} /></Field>
      <Field label="Start date"><input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
      <Field label="Due date"><input type="date" value={f.due_date} onChange={set('due_date')} /></Field>
      {f.status === 'Completed' && <Field label="Completed on" hint={t.completed_date ? undefined : 'Today, unless you pick a date'}>
        <input type="date" value={f.completed_date} onChange={set('completed_date')} /></Field>}
      <Field label="Remarks" wide><textarea rows="3" value={f.remarks} onChange={set('remarks')} /></Field>
      <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy}>Save</button></div>
    </form>
  </Modal>;
}

// --- Sites: access and checklists per powerhouse -----------------------------

export function Sites({ project: p }) {
  const [filters, setFilter] = useFilters();
  if (!p.sites.length) return <Card><Empty>No sites have access lists or checklists.</Empty></Card>;
  if (filters.site) return <Site project={p} islandId={filters.site} onBack={() => setFilter('site', '')} />;
  const atolls = [...new Set(p.sites.map((s) => s.atoll_code))];
  return atolls.map((code) => <Card key={code} title={`${code} · ${p.sites.filter((s) => s.atoll_code === code).length} sites`}>
    <div className="facility-grid">{p.sites.filter((s) => s.atoll_code === code).map((s) => (
      <button key={s.island_id} type="button" className="facility site-tile" onClick={() => setFilter('site', s.island_id)}>
        <strong>{s.island_name}</strong>
        <div className="row"><span>🔑 {s.access_granted} of {s.access_total} granted</span>{s.access_requested > 0 && <span className="flag info">{s.access_requested} requested</span>}</div>
        <div className="row"><span>☑ {s.checklist_checked} of {s.checklist_total} checked</span>
          {s.checklist_missing > 0 && <span className="flag bad">{s.checklist_missing} not available</span>}
          {s.stationery_short > 0 && <span className="flag warn">{s.stationery_short} stationery short</span>}</div>
      </button>))}</div>
  </Card>);
}

function Site({ project: p, islandId, onBack }) {
  const state = useApi(`/projects/${p.id}/sites/${islandId}`);
  return <Async state={state}>{(d) => <>
    <div className="filters"><button className="btn small ghost" onClick={onBack}>← All sites</button>
      <h2 className="site-name">{d.island.atoll_code} · <Link to={`/islands/${d.island.id}`}>{d.island.name}</Link></h2></div>
    <Card title="Rights & access">
      <div className="table-scroll"><table>
        <thead><tr><th>System</th><th className="hide-sm">Granting dept</th><th>Status</th><th className="hide-sm">Requested</th><th className="hide-sm">Granted</th><th>Granted to</th><th className="hide-sm">Remarks</th></tr></thead>
        <tbody>{d.access_items.map((x) => <AccessRow key={x.id} project={p} item={x} editable={d.can_edit} onSaved={state.reload} />)}</tbody>
      </table></div>
    </Card>
    {Object.entries(CHECKLISTS).map(([list, label]) => {
      const items = d.checklist.filter((x) => x.list === list);
      if (!items.length) return null;
      return <Card key={list} title={`${label} (${items.filter((x) => x.availability || x.available_qty != null).length} of ${items.length} checked)`}>
        <div className="table-scroll"><table>
          <thead><tr><th>Item</th>{list === 'stationery'
            ? <><th className="num">Required</th><th className="num">Available</th><th className="num">Shortfall</th><th>Status</th></>
            : <><th>Availability</th><th className="num">Quantity</th></>}<th className="hide-sm">Remarks</th></tr></thead>
          <tbody>{items.map((x) => <CheckRow key={x.id} project={p} item={x} editable={d.can_edit} onSaved={state.reload} />)}</tbody>
        </table></div>
      </Card>;
    })}
  </>}</Async>;
}

// Rows save as soon as a value changes (selects) or the field is left (text).
function useRowSave(url, onSaved) {
  const [error, setError] = useState(null);
  const save = async (body) => {
    setError(null);
    try { await api(url, { method: 'PATCH', body }); onSaved(); } catch (err) { setError(err); }
  };
  return { save, error };
}

function AccessRow({ project: p, item: x, editable, onSaved }) {
  const { save, error } = useRowSave(`/projects/${p.id}/access/${x.id}`, onSaved);
  const text = (k) => (e) => { const v = e.target.value.trim(); if (v !== (x[k] || '')) save({ [k]: v || null }); };
  const tone = { Granted: 'ok', Requested: 'info', Rejected: 'bad' }[x.status] || 'none';
  return <tr>
    <td className="wrap"><strong>{x.system}</strong>{error && <div className="bad small">{error.message}</div>}</td>
    <td className="hide-sm small">{x.granting_dept}</td>
    <td>{editable ? <Select value={x.status} onChange={(v) => save({ status: v })} options={ACCESS_STATUSES.map((s) => [s, s])} aria-label={`${x.system} status`} />
      : <span className={`status ${tone}`}>{x.status}</span>}</td>
    <td className="hide-sm small nowrap">{editable ? <input type="date" defaultValue={x.requested_on || ''} onBlur={(e) => e.target.value !== (x.requested_on || '') && save({ requested_on: e.target.value || null })} aria-label="Requested on" /> : date(x.requested_on)}</td>
    <td className="hide-sm small nowrap">{editable ? <input type="date" defaultValue={x.granted_on || ''} onBlur={(e) => e.target.value !== (x.granted_on || '') && save({ granted_on: e.target.value || null })} aria-label="Granted on" /> : date(x.granted_on)}</td>
    <td>{editable ? <input defaultValue={x.granted_to || ''} onBlur={text('granted_to')} maxLength="200" aria-label="Granted to" /> : x.granted_to || '—'}</td>
    <td className="hide-sm">{editable ? <input defaultValue={x.remarks || ''} onBlur={text('remarks')} aria-label="Remarks" /> : x.remarks || ''}</td>
  </tr>;
}

function CheckRow({ project: p, item: x, editable, onSaved }) {
  const { save, error } = useRowSave(`/projects/${p.id}/checklist/${x.id}`, onSaved);
  const number = (k) => (e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (x[k] == null ? null : Number(x[k]))) save({ [k]: v }); };
  const remarks = editable ? <input defaultValue={x.remarks || ''} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (x.remarks || '')) save({ remarks: v || null }); }} aria-label="Remarks" /> : x.remarks || '';
  const availability = editable ? <Select value={x.availability || ''} onChange={(v) => save({ availability: v || null })} placeholder="—" options={AVAILABILITY.map((s) => [s, s])} aria-label={`${x.item} availability`} />
    : <span className={`status ${{ Available: 'ok', 'Not Available': 'bad', Partial: 'warn', Requested: 'info' }[x.availability] || 'none'}`}>{x.availability || '—'}</span>;
  return <tr>
    <td className="wrap">{x.item}{error && <div className="bad small">{error.message}</div>}</td>
    {x.list === 'stationery' ? <>
      <td className="num">{x.required_qty != null ? num(x.required_qty) : '—'}</td>
      <td className="num">{editable ? <input className="qty" type="number" min="0" defaultValue={x.available_qty ?? ''} onBlur={number('available_qty')} aria-label="Available quantity" /> : x.available_qty ?? '—'}</td>
      <td className={`num ${Number(x.shortfall) > 0 ? 'bad' : ''}`}>{x.shortfall != null ? num(x.shortfall) : ''}</td>
      <td>{availability}</td>
    </> : <>
      <td>{availability}</td>
      <td className="num">{editable ? <input className="qty" type="number" min="0" defaultValue={x.quantity ?? ''} onBlur={number('quantity')} aria-label="Quantity" /> : x.quantity ?? '—'}</td>
    </>}
    <td className="hide-sm">{remarks}</td>
  </tr>;
}

