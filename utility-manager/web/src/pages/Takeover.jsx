// The national takeover: utility services on every inhabited island moving
// from FENAKA to STELCO. The figures and progress, a map of the 20 atolls
// coloured by how far each is, and an atoll's islands with each service's
// status and date. Managers keep it up to date.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, Modal, PageHead, Select, Stat } from '../components/ui.jsx';
import { date, num } from '../format.js';
import { useApi, useFilters, useSubmit } from '../hooks.js';

const SERVICES = [['electricity', 'Electricity'], ['water', 'Water'], ['sewerage', 'Sewerage']];
const STATUS = { taken_over: 'Taken over', pending: 'Pending', not_applicable: 'Not applicable' };
const STATE = { taken_over: 'Under STELCO', pending: 'Under FENAKA', not_set: 'Not set' };

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

export default function Takeover() {
  const state = useApi('/takeover');
  return <>
    <PageHead title="National takeover" icon="takeover" subtitle="Utility services on every inhabited island, from FENAKA to STELCO" />
    <Async state={state}>{(t) => <TakeoverView t={t} reload={state.reload} />}</Async>
  </>;
}

function TakeoverView({ t, reload }) {
  const { can } = useAuth();
  const [filters, setFilter] = useFilters();
  const [editing, setEditing] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState(null);
  const done = t.totals.taken_over;
  const total = t.expected_islands;
  const match = (i) => !filters.show || i.state === filters.show;
  const atoll = t.atolls.find((a) => a.code === filters.atoll);
  const list = t.islands.filter((i) => (!atoll || i.atoll_code === atoll.code) && match(i));

  return <>
    <div className="stats">
      <Stat label="Inhabited islands" value={num(total)} sub={`Across 20 atolls · ${num(t.totals.islands)} on the list`} />
      <Stat label="Taken over" value={num(done)} sub="Now under STELCO" />
      <Stat label="Remaining" value={num(Math.max(0, total - done))} sub={`${num(t.totals.pending)} pending · ${num(Math.max(0, total - t.totals.islands))} not on the list yet`} tone="warn" />
      <Stat label="Progress" value={`${pct(done, total)}%`} sub="Of inhabited islands" />
    </div>
    <Card title="Takeover progress">
      <div className="tko-bar"><span style={{ width: `${pct(done, total)}%` }} /></div>
      <p className="small"><strong>{num(done)} of {num(total)}</strong> inhabited islands</p>
      <div className="tko-services">{SERVICES.map(([k, label]) => {
        const s = t.services[k];
        const of = s.taken_over + s.pending;
        return <div key={k}><span className="small">{label}</span>
          <div className="tko-bar thin"><span style={{ width: `${pct(s.taken_over, of)}%` }} /></div>
          <small className="muted">{num(s.taken_over)} taken over · {num(s.pending)} pending</small></div>;
      })}</div>
    </Card>

    <div className="tko-layout">
      <Card title={atoll ? `Map · ${atoll.name}` : 'Map'} className="tko-map-card">
        <AtollMap atolls={t.atolls} islands={t.islands} match={match} selected={filters.atoll} picked={picked}
          onPick={(code) => { setPicked(null); setFilter('atoll', filters.atoll === code ? '' : code); }}
          onIsland={(i) => { setPicked(i.id); if (can('manager')) setEditing(i); }} />
        <div className="tko-legend small"><span><i className="dot taken" /> Taken over by STELCO</span><span><i className="dot pending" /> Pending / under FENAKA</span><span><i className="dot none" /> Not set</span>
          {filters.atoll && <button className="link" onClick={() => { setPicked(null); setFilter('atoll', ''); }}>← Whole country</button>}</div>
        {t.islands.some((i) => i.lat == null) && <p className="muted small">Not on the map (no position yet): {t.islands.filter((i) => i.lat == null).map((i) => `${i.atoll_code}. ${i.name}`).join(', ')}</p>}
      </Card>
      <div>
        <div className="chips">
          {[['', 'All islands'], ['taken_over', 'Under STELCO'], ['pending', 'Under FENAKA'], ['not_set', 'Not set']].map(([k, l]) =>
            <button key={k} className={`chip ${(filters.show || '') === k ? 'on' : ''}`} onClick={() => setFilter('show', k)}>{l}</button>)}
        </div>
        <Card title={atoll ? `${atoll.code} · ${atoll.name}` : 'All atolls'}
          actions={<>{atoll && <button className="btn small ghost" onClick={() => setFilter('atoll', '')}>All atolls</button>}
            {can('manager') && atoll && atoll.islands > 0 && <button className="btn small" onClick={() => setBulk(true)}>Set for whole atoll</button>}
            {can('manager') && <button className="btn small primary" onClick={() => setEditing({ atoll_code: atoll?.code || '' })}>Add island</button>}</>}>
          {!atoll && !filters.show ? <AtollTable atolls={t.atolls} onPick={(code) => setFilter('atoll', code)} />
            : list.length === 0 ? <Empty>No islands here{filters.show ? ' with this status' : ' on the list yet'}.{can('manager') && ' Add them with Add island.'}</Empty>
              : <IslandTable islands={list} showAtoll={!atoll} picked={picked} onEdit={can('manager') ? setEditing : null} />}
        </Card>
      </div>
    </div>
    {bulk && atoll && <AtollForm atoll={atoll} onClose={() => setBulk(false)} onSaved={() => { setBulk(false); reload(); }} />}
    {editing && <IslandForm row={editing} atolls={t.atolls} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
  </>;
}

// The map: every island at its place (OpenStreetMap positions, migration
// 055), coloured by its state; each atoll's outline shaded and clickable.
// Picking an atoll zooms to it and names its islands; picking an island
// shows it in the list. Lon/lat drawn straight (the Maldives is near the
// equator, so the stretch is negligible), 100 units to the degree.
const BOUNDS = { west: 72.5, east: 73.9, north: 7.25, south: -0.8 };
const toXY = (i) => [(i.lon - BOUNDS.west) * 100, (BOUNDS.north - i.lat) * 100];
const FULL = [0, 0, (BOUNDS.east - BOUNDS.west) * 100, (BOUNDS.north - BOUNDS.south) * 100];

// The outline round an atoll's islands (convex hull, padded).
function hull(points, pad) {
  if (points.length === 1) {
    const [x, y] = points[0];
    return Array.from({ length: 12 }, (_, k) => [x + pad * Math.cos(k * Math.PI / 6), y + pad * Math.sin(k * Math.PI / 6)]);
  }
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => list.reduce((h, p) => { while (h.length >= 2 && cross(h.at(-2), h.at(-1), p) <= 0) h.pop(); h.push(p); return h; }, []);
  const lower = half(pts);
  const upper = half([...pts].reverse());
  const ring = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  const cx = ring.reduce((n, p) => n + p[0], 0) / ring.length;
  const cy = ring.reduce((n, p) => n + p[1], 0) / ring.length;
  // Push each corner out from the middle, and round the shape a little.
  return ring.flatMap((p) => {
    const dx = p[0] - cx; const dy = p[1] - cy; const d = Math.hypot(dx, dy) || 1;
    return [[p[0] + (dx / d) * pad, p[1] + (dy / d) * pad]];
  });
}

// The viewBox eases from one view to the next.
function useEased(target) {
  const [view, setView] = useState(target);
  const key = target.join(',');
  useEffect(() => {
    const from = view;
    const start = performance.now();
    let frame;
    const step = (now) => {
      const k = Math.min(1, (now - start) / 350);
      const e = 1 - (1 - k) ** 3;
      setView(from.map((v, n) => v + (target[n] - v) * e));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return view;
}

function AtollMap({ atolls, islands, match, selected, onPick, picked, onIsland }) {
  const placed = islands.filter((i) => i.lat != null && i.lon != null);
  const byAtoll = Object.fromEntries(atolls.map((a) => [a.code, placed.filter((i) => i.atoll_code === a.code)]));
  const target = (() => {
    const list = selected && byAtoll[selected];
    if (!list?.length) return FULL;
    const xy = list.map(toXY);
    const xs = xy.map((p) => p[0]); const ys = xy.map((p) => p[1]);
    const pad = 8;
    let [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
    // Wide enough for the island names.
    const w = Math.max(x1 - x0, (y1 - y0) * 0.75, 30); const h = Math.max(y1 - y0, 30);
    const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    return [cx - w / 2, cy - h / 2, w, h];
  })();
  const view = useEased(target);
  const zoomed = view[2] < FULL[2] * 0.6;
  const unit = view[2] / 100; // sizes follow the zoom
  const tone = (a) => (!a.islands ? 'none' : a.taken_over === a.islands ? 'taken' : 'pending');
  return <svg className="tko-map" viewBox={view.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Islands by takeover status">
    {atolls.map((a) => {
      const xy = byAtoll[a.code].map(toXY);
      if (!xy.length) return null;
      const ring = hull(xy, 4);
      const [lx, ly] = [Math.max(...xy.map((p) => p[0])) + 5, xy.reduce((n, p) => n + p[1], 0) / xy.length];
      return <g key={a.code} className={`tko-atoll ${tone(a)}${selected === a.code ? ' selected' : ''}`}
        onClick={() => onPick(a.code)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onPick(a.code)}>
        <title>{`${a.name}: ${a.taken_over} of ${a.islands} taken over`}</title>
        <polygon points={ring.map((p) => p.join(',')).join(' ')} strokeWidth={unit * 0.35} strokeLinejoin="round" />
        {!zoomed && <text x={lx} y={ly} fontSize={unit * 2.6} className="atoll-name">{a.code}<tspan className="count" dx={unit}>{a.taken_over}/{a.islands}</tspan></text>}
      </g>;
    })}
    {placed.map((i) => {
      const [x, y] = toXY(i);
      const on = match(i);
      return <g key={i.id} className={`tko-island ${i.state}${picked === i.id ? ' picked' : ''}${on ? '' : ' dim'}`}
        onClick={(e) => { e.stopPropagation(); if (!zoomed) onPick(i.atoll_code); else onIsland(i); }}>
        <title>{`${i.atoll_code}. ${i.name}: ${STATE[i.state]}`}</title>
        <circle cx={x} cy={y} r={unit * (zoomed ? 1.1 : 0.75)} strokeWidth={unit * 0.25} />
        {zoomed && selected === i.atoll_code && <text x={x + unit * 1.8} y={y + unit * 0.9} fontSize={unit * 2.4}>{i.name}</text>}
      </g>;
    })}
  </svg>;
}

function AtollTable({ atolls, onPick }) {
  return <div className="table-scroll"><table>
    <thead><tr><th>Atoll</th><th className="num">On the list</th><th className="num">Taken over</th><th className="num">Pending</th><th className="hide-sm">Progress</th></tr></thead>
    <tbody>{atolls.map((a) => <tr key={a.code} className="row-link" onClick={() => onPick(a.code)}>
      <td><strong>{a.code}</strong> · {a.name}</td>
      <td className="num">{a.islands || <span className="muted">—</span>}</td>
      <td className="num">{a.taken_over || ''}</td>
      <td className="num">{a.pending || ''}</td>
      <td className="hide-sm">{a.islands ? <div className="tko-bar thin"><span style={{ width: `${pct(a.taken_over, a.islands)}%` }} /></div> : null}</td>
    </tr>)}</tbody>
  </table></div>;
}

function Service({ status, on }) {
  if (!status) return <span className="muted">—</span>;
  return <span className={`tko-pill ${status}`} title={on ? `${status === 'taken_over' ? 'Taken over' : 'Planned'} ${date(on)}` : undefined}>
    {STATUS[status]}{on && status !== 'not_applicable' ? ` · ${date(on)}` : ''}</span>;
}

function IslandTable({ islands, showAtoll, picked, onEdit }) {
  return <div className="table-scroll"><table>
    <thead><tr><th>Island</th>{SERVICES.map(([k, l]) => <th key={k}>{l}</th>)}<th className="hide-sm">Phase</th>{onEdit && <th />}</tr></thead>
    <tbody>{islands.map((i) => <tr key={i.id} className={picked === i.id ? 'picked' : ''}>
      <td className="wrap"><strong>{showAtoll && `${i.atoll_code}. `}{i.island_id ? <Link to={`/islands/${i.island_id}`}>{i.name}</Link> : i.name}</strong>
        <br /><small className={`tko-state ${i.state}`}>{STATE[i.state]}</small>{i.notes && <><br /><small className="muted">{i.notes}</small></>}</td>
      {SERVICES.map(([k]) => <td key={k} className="small"><Service status={i[`${k}_status`]} on={i[`${k}_on`]} /></td>)}
      <td className="hide-sm small">{i.phase || <span className="muted">—</span>}</td>
      {onEdit && <td><button className="btn small" onClick={() => onEdit(i)}>Edit</button></td>}
    </tr>)}</tbody>
  </table></div>;
}

function IslandForm({ row, atolls, onClose, onSaved }) {
  const { can } = useAuth();
  const srd = useApi('/islands');
  const [f, setF] = useState(() => ({
    atoll_code: row.atoll_code || '', name: row.name || '', island_id: row.island_id || '', phase: row.phase || '', notes: row.notes || '',
    ...Object.fromEntries(SERVICES.flatMap(([k]) => [[`${k}_status`, row[`${k}_status`] || ''], [`${k}_on`, row[`${k}_on`] || '']])),
  }));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const save = useSubmit(async () => {
    const body = { atoll_code: f.atoll_code, name: f.name.trim(), island_id: f.island_id || null, phase: f.phase || null, notes: f.notes || null,
      ...Object.fromEntries(SERVICES.flatMap(([k]) => [[`${k}_status`, f[`${k}_status`] || null], [`${k}_on`, f[`${k}_status`] && f[`${k}_status`] !== 'not_applicable' ? f[`${k}_on`] || null : null]])) };
    if (row.id) await api(`/takeover/islands/${row.id}`, { method: 'PATCH', body });
    else await api('/takeover/islands', { method: 'POST', body });
    onSaved();
  });
  const remove = useSubmit(async () => {
    if (!window.confirm(`Remove ${row.atoll_code}. ${row.name} from the takeover list?`)) return;
    await api(`/takeover/islands/${row.id}`, { method: 'DELETE' });
    onSaved();
  });
  const srdHere = (srd.data || []).filter((i) => i.atoll_code === f.atoll_code);
  return <Modal title={row.id ? `${row.atoll_code}. ${row.name}` : 'Add island'} onClose={onClose}>
    <form className="form" onSubmit={(e) => { e.preventDefault(); save.submit(); }}>
      <ErrorBox error={save.error || remove.error} />
      <Field label="Atoll"><Select required value={f.atoll_code} onChange={set('atoll_code')} placeholder="Choose…" options={atolls.map((a) => [a.code, `${a.code} · ${a.name}`])} /></Field>
      <Field label="Island"><input required maxLength="100" value={f.name} onChange={set('name')} /></Field>
      {srdHere.length > 0 && <Field label="SRD island (if SRD manages it)"><Select value={f.island_id} onChange={(v) => { set('island_id')(v); const i = srdHere.find((x) => x.id === v); if (i && !f.name) set('name')(i.name); }}
        placeholder="—" options={srdHere.map((i) => [i.id, i.name])} /></Field>}
      <Field label="Phase / batch"><input maxLength="100" value={f.phase} onChange={set('phase')} placeholder="e.g. Phase 2" /></Field>
      {SERVICES.map(([k, label]) => <Field key={k} label={label}>
        <div className="tko-service-input">
          <Select value={f[`${k}_status`]} onChange={set(`${k}_status`)} placeholder="Not set" options={Object.entries(STATUS)} />
          {f[`${k}_status`] && f[`${k}_status`] !== 'not_applicable' && <input type="date" value={f[`${k}_on`]} onChange={set(`${k}_on`)}
            aria-label={`${label}: ${f[`${k}_status`] === 'taken_over' ? 'taken over on' : 'planned for'}`} title={f[`${k}_status`] === 'taken_over' ? 'Taken over on' : 'Planned for'} />}
        </div></Field>)}
      <Field label="Notes" wide><textarea rows="2" maxLength="2000" value={f.notes} onChange={set('notes')} /></Field>
      <p className="muted small wide">Date: when it was taken over, or when it is planned while pending.</p>
      <div className="form-actions">
        {row.id && can('admin') && <button type="button" className="btn danger" disabled={remove.busy} onClick={remove.submit} style={{ marginRight: 'auto' }}>Remove</button>}
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={save.busy}>Save</button></div>
    </form>
  </Modal>;
}

// One service for every island of an atoll at once, e.g. "Seenu: electricity
// taken over". Islands already set keep theirs unless "all" is ticked.
function AtollForm({ atoll, onClose, onSaved }) {
  const [f, setF] = useState({ service: 'electricity', status: 'taken_over', on: '', all: false });
  const { submit, busy, error } = useSubmit(async () => {
    await api(`/takeover/atolls/${atoll.code}`, { method: 'POST', body: { service: f.service, status: f.status, on: f.on || null, all: f.all } });
    onSaved();
  });
  return <Modal title={`${atoll.code} · ${atoll.name}: set for the whole atoll`} onClose={onClose}>
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <ErrorBox error={error} />
      <Field label="Service"><Select value={f.service} onChange={(v) => setF({ ...f, service: v })} options={SERVICES} /></Field>
      <Field label="Status"><Select value={f.status} onChange={(v) => setF({ ...f, status: v })} options={Object.entries(STATUS)} /></Field>
      {f.status !== 'not_applicable' && <Field label={f.status === 'taken_over' ? 'Taken over on (optional)' : 'Planned for (optional)'}>
        <input type="date" value={f.on} onChange={(e) => setF({ ...f, on: e.target.value })} /></Field>}
      <label className="check wide"><input type="checkbox" checked={f.all} onChange={(e) => setF({ ...f, all: e.target.checked })} /> Also change islands already set (otherwise only those not set yet)</label>
      <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy}>Apply to {atoll.name}</button></div>
    </form>
  </Modal>;
}
