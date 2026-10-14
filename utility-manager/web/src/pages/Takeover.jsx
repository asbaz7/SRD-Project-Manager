// The national takeover: utility services on every inhabited island moving
// from FENAKA to STELCO. The figures and progress, a map of the 20 atolls
// coloured by how far each is, and an atoll's islands with each service's
// status and date. Managers keep it up to date.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, Modal, PageHead, Select, Stat } from '../components/ui.jsx';
import { date, num } from '../format.js';
import { useApi, useFilters, useSubmit } from '../hooks.js';

const SERVICES = [['electricity', 'Electricity'], ['water', 'Water'], ['sewerage', 'Sewerage']];
const STATUS = { taken_over: 'Taken over', pending: 'Pending', not_applicable: 'Not applicable' };
const STATE = { taken_over: 'Under STELCO', pending: 'Under FENAKA', not_set: 'Not set' };

// The atolls drawn north to south, roughly as they lie (x, y, width, height
// in a 300 × 920 box), like the takeover map.
const SHAPES = {
  HA: [150, 40, 26, 46], HDh: [150, 100, 24, 44], Sh: [132, 156, 20, 40], N: [160, 205, 20, 38],
  R: [96, 218, 18, 40], B: [100, 268, 22, 34], Lh: [165, 268, 20, 38], K: [168, 340, 20, 62],
  AA: [100, 322, 18, 30], ADh: [100, 380, 22, 40], V: [168, 418, 16, 26], M: [168, 470, 18, 36],
  F: [102, 452, 16, 28], Dh: [104, 506, 20, 34], Th: [118, 572, 24, 38], L: [160, 640, 26, 40],
  GA: [116, 712, 18, 32], GDh: [122, 770, 24, 40], Gn: [168, 818, 9, 9], S: [146, 872, 22, 30],
};

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
      <Card title="Atolls" className="tko-map-card">
        <AtollMap atolls={t.atolls} islands={t.islands} match={match} selected={filters.atoll} onPick={(code) => setFilter('atoll', filters.atoll === code ? '' : code)} />
        <div className="tko-legend small"><span><i className="dot taken" /> Taken over by STELCO</span><span><i className="dot pending" /> Pending / still under FENAKA</span><span><i className="dot none" /> Not on the list yet</span></div>
      </Card>
      <div>
        <div className="chips">
          {[['', 'All islands'], ['taken_over', 'Under STELCO'], ['pending', 'Under FENAKA'], ['not_set', 'Not set']].map(([k, l]) =>
            <button key={k} className={`chip ${(filters.show || '') === k ? 'on' : ''}`} onClick={() => setFilter('show', k)}>{l}</button>)}
        </div>
        <Card title={atoll ? `${atoll.code} · ${atoll.name}` : 'All atolls'}
          actions={<>{atoll && <button className="btn small ghost" onClick={() => setFilter('atoll', '')}>All atolls</button>}
            {can('manager') && <button className="btn small primary" onClick={() => setEditing({ atoll_code: atoll?.code || '' })}>Add island</button>}</>}>
          {!atoll && !filters.show ? <AtollTable atolls={t.atolls} onPick={(code) => setFilter('atoll', code)} />
            : list.length === 0 ? <Empty>No islands here{filters.show ? ' with this status' : ' on the list yet'}.{can('manager') && ' Add them with Add island.'}</Empty>
              : <IslandTable islands={list} showAtoll={!atoll} onEdit={can('manager') ? setEditing : null} />}
        </Card>
      </div>
    </div>
    {editing && <IslandForm row={editing} atolls={t.atolls} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
  </>;
}

// The map: each atoll a shape, green when every island on the list is taken
// over, orange while any is pending, grey with none on the list; a partly
// taken-over atoll shows its share.
function AtollMap({ atolls, islands, match, selected, onPick }) {
  return <svg className="tko-map" viewBox="0 0 300 920" role="img" aria-label="Atolls by takeover status">
    {atolls.map((a) => {
      const [x, y, w, h] = SHAPES[a.code];
      const listed = islands.filter((i) => i.atoll_code === a.code);
      const shown = listed.filter(match).length;
      const tone = !a.islands ? 'none' : a.pending || a.not_set ? 'pending' : 'taken';
      const left = x < 140;
      return <g key={a.code} className={`tko-atoll ${tone}${selected === a.code ? ' selected' : ''}${listed.length && !shown ? ' dim' : ''}`}
        onClick={() => onPick(a.code)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onPick(a.code)}>
        <title>{`${a.name}: ${a.taken_over} of ${a.islands} taken over`}</title>
        <ellipse cx={x} cy={y} rx={w / 2} ry={h / 2} />
        {a.islands > 0 && a.taken_over > 0 && a.taken_over < a.islands &&
          <ellipse className="share" cx={x} cy={y} rx={w / 2} ry={h / 2} pathLength="100" strokeDasharray={`${pct(a.taken_over, a.islands)} 100`} />}
        <text x={left ? x - w / 2 - 8 : x + w / 2 + 8} y={y - 2} textAnchor={left ? 'end' : 'start'} className="name">{a.name}</text>
        <text x={left ? x - w / 2 - 8 : x + w / 2 + 8} y={y + 12} textAnchor={left ? 'end' : 'start'} className="count">{a.islands ? `${a.taken_over}/${a.islands}` : '—'}</text>
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

function IslandTable({ islands, showAtoll, onEdit }) {
  return <div className="table-scroll"><table>
    <thead><tr><th>Island</th>{SERVICES.map(([k, l]) => <th key={k}>{l}</th>)}<th className="hide-sm">Phase</th>{onEdit && <th />}</tr></thead>
    <tbody>{islands.map((i) => <tr key={i.id}>
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
