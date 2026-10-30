// Monthly updates for water plants and sewerage systems: a card per plant
// (updated or due), and the form: per asset its status, running hours and
// any fault, and for a water plant the water produced that month.
import { useState } from 'react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, Modal, Select } from '../components/ui.jsx';
import { ASSET_STATUS, assetLabel, dateTime, month, num } from '../format.js';
import { useApi, useFilters, useSubmit } from '../hooks.js';

const STATUSES = ['running', 'standby', 'down', 'maintenance', 'disconnected'];

export default function PlantUpdates({ svc }) {
  const { can, canWriteIsland } = useAuth();
  const [filters, setFilter] = useFilters();
  const atolls = useApi('/atolls');
  const state = useApi(`/services/${svc}/updates${qs({ atoll_id: filters.atoll_id })}`);
  const [open, setOpen] = useState(null);
  return <>
    <div className="filters">
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
        options={(atolls.data || []).map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />
      <label className="check"><input type="checkbox" checked={filters.missing === '1'} onChange={(e) => setFilter('missing', e.target.checked ? '1' : '')} /> Only due</label>
    </div>
    <Async state={state}>{(d) => {
      const rows = filters.missing === '1' ? d.plants.filter((p) => p.state !== 'up_to_date') : d.plants;
      if (!d.plants.length) return <Card><Empty>No {svc === 'water' ? 'water plants' : 'sewerage systems'} recorded yet.</Empty></Card>;
      return <>
        <p className="muted small">Each plant is updated once a month: every asset's status, running hours and any fault{svc === 'water' ? ', and the water produced' : ''}.
          {' '}{month(d.expected_month)} is due by the 10th · <strong>{d.due ? `${d.due} due` : 'all in'}</strong></p>
        <div className="asset-board">{rows.map((p) => {
          const can_ = can('manager') && canWriteIsland({ id: p.island_id, atoll_id: p.atoll_id }) && p.asset_count > 0;
          return <section key={p.facility_id} className={`area-card plant-update ${p.state}`}>
            <div className="area-card-head"><strong>{p.atoll_code}. {p.island_name}</strong><span>{num(p.asset_count)} asset{p.asset_count === 1 ? '' : 's'}</span></div>
            <span className="muted small">{p.name}</span>
            <span className={`pu-state ${p.state}`}>{p.state === 'up_to_date' ? `Updated · ${month(p.month)}` : p.month ? `${month(d.expected_month)} due · last ${month(p.month)}` : 'No update yet'}</span>
            {p.produced_m3 != null && <span className="small">Produced {num(p.produced_m3)} m³</span>}
            {p.updated_at && <span className="muted small">{dateTime(p.updated_at)}{p.updated_by_name && ` · ${p.updated_by_name}`}</span>}
            {can_ && <button className={`btn small ${p.state === 'up_to_date' ? 'ghost' : 'primary'}`} onClick={() => setOpen(p.facility_id)}>
              {p.state === 'up_to_date' ? 'Edit this month' : 'Update'}</button>}
          </section>;
        })}</div>
      </>;
    }}</Async>
    {open && <PlantUpdateForm facilityId={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); state.reload(); }} />}
  </>;
}

export function PlantUpdateForm({ facilityId, onClose, onSaved }) {
  const state = useApi(`/facilities/${facilityId}/plant-update`);
  return <Modal title="Monthly plant update" onClose={onClose}>
    <Async state={state}>{(d) => <Rows d={d} onClose={onClose} onSaved={onSaved} />}</Async>
  </Modal>;
}

function Rows({ d, onClose, onSaved }) {
  const water = d.plant.service === 'water';
  const [produced, setProduced] = useState(d.current?.produced_m3 != null ? String(Number(d.current.produced_m3)) : '');
  const [note, setNote] = useState(d.current?.note || '');
  const [rows, setRows] = useState(() => d.assets.map((a) => ({
    asset_id: a.id, status: a.month_status || a.status,
    running_hours: a.month_hours != null ? String(Number(a.month_hours)) : '', fault: a.month_fault || '',
  })));
  const set = (i, k) => (v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v?.target ? v.target.value : v } : r)));
  const { submit, busy, error } = useSubmit(async () => {
    await api(`/facilities/${d.plant.id}/plant-update`, { method: 'POST', body: {
      produced_m3: water && produced !== '' ? Number(produced) : null, note: note || null,
      items: rows.map((r) => ({ asset_id: r.asset_id, status: STATUSES.includes(r.status) ? r.status : undefined,
        running_hours: r.running_hours === '' ? null : Number(r.running_hours), fault: r.fault || null })),
    } });
    onSaved();
  });
  return <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
    <p className="wide"><strong>{d.plant.atoll_code}. {d.plant.island_name}</strong> · {d.plant.name} · {month(d.month)}</p>
    <ErrorBox error={error} />
    {water && <Field label="Water produced this month (m³)"><input type="number" min="0" step="any" value={produced} onChange={(e) => setProduced(e.target.value)} /></Field>}
    <div className="wide table-scroll"><table className="pu-table">
      <thead><tr><th>Asset</th><th>Status</th><th>Running hours</th><th>Fault</th></tr></thead>
      <tbody>{d.assets.map((a, i) => <tr key={a.id}>
        <td><strong>{assetLabel(a)}</strong><br /><small className="muted">{a.make_model || '—'}</small></td>
        <td><Select value={rows[i].status} onChange={set(i, 'status')} options={STATUSES.map((s) => [s, ASSET_STATUS[s].label])} aria-label={`${assetLabel(a)} status`} /></td>
        <td><input type="number" min="0" step="any" value={rows[i].running_hours} onChange={set(i, 'running_hours')}
          placeholder={a.last_hours != null ? `last ${num(a.last_hours)}` : a.running_hours != null ? `${num(a.running_hours)}` : ''} aria-label={`${assetLabel(a)} running hours`} /></td>
        <td><input value={rows[i].fault} onChange={set(i, 'fault')} placeholder={rows[i].status === 'down' ? "What's wrong" : 'None'} maxLength="2000" aria-label={`${assetLabel(a)} fault`} /></td>
      </tr>)}</tbody>
    </table></div>
    <Field label="Note (optional)" wide><textarea rows="2" value={note} onChange={(e) => setNote(e.target.value)} maxLength="2000" /></Field>
    <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save update</button></div>
  </form>;
}
