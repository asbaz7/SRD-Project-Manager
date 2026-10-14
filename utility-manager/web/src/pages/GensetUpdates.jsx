// The monthly genset update: each powerhouse records, per genset, its
// running hours, condition, fault and whether it needs an overhaul or an
// alternator service. Entered here (Electricity → Updates, or on the island
// page) by technical managers; replaces the condition report workbooks.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, ErrorBox, Modal, Select } from '../components/ui.jsx';
import { ASSET_STATUS, FAULTS, dateTime, month, num } from '../format.js';

const STATUSES = ['running', 'standby', 'down', 'maintenance', 'disconnected'];
import { useApi, useFilters, useSubmit } from '../hooks.js';

const SOURCE = { update: 'Monthly update', upload: 'Workbook', fleet_manager: 'Fleet Manager' };
const missing = (state) => state === 'missing' || state === 'never';

export default function GensetUpdates() {
  const { can, canWriteIsland } = useAuth();
  const [filters, setFilter] = useFilters();
  const atolls = useApi('/atolls');
  const tracker = useApi(`/condition-reports${qs({ atoll_id: filters.atoll_id })}`);
  const [open, setOpen] = useState(null);
  return <>
    <div className="filters">
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
        options={(atolls.data || []).map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />
      <label className="check"><input type="checkbox" checked={filters.missing === '1'} onChange={(e) => setFilter('missing', e.target.checked ? '1' : '')} /> Only due</label>
    </div>
    <Async state={tracker}>{(t) => {
      const rows = filters.missing === '1' ? t.powerhouses.filter((p) => missing(p.state)) : t.powerhouses;
      return <Card title={`Updates for ${month(t.expected_month)} · ${t.missing ? `${t.missing} due` : 'all in'}${t.not_expected ? ` · ${t.not_expected} not surveyed yet` : ''}`}>
        <p className="muted small">Each powerhouse's gensets are updated once a month (running hours, condition, faults), last month's by the {t.due_day}th.
          Service dates come from maintenance records and completed work. Powerhouses not surveyed yet are not chased: set the month updates start on the powerhouse (island page → Edit).</p>
        <div className="table-scroll"><table>
          <thead><tr><th>Powerhouse</th><th>Last update</th><th className="hide-sm">By</th><th className="num hide-sm">Gensets</th><th /></tr></thead>
          <tbody>{rows.map((p) => <tr key={p.facility_id} className={missing(p.state) ? 'attention' : ''}>
            <td><Link to={`/islands/${p.island_id}`}><strong>{p.atoll_code} · {p.island_name}</strong></Link></td>
            <td><span className={`state ${p.state}`}>{p.state === 'up_to_date' ? '✓ ' : p.state === 'never' ? '✕ None yet' : ['untracked', 'not_expected'].includes(p.state) ? '– ' : '✕ '}
              {p.report_month ? month(p.report_month) : p.state === 'not_expected' ? 'Not surveyed yet' : ''}</span>
              {p.state === 'not_expected' && p.reports_from && <><br /><small className="muted">from {month(p.reports_from)}</small></>}
              {p.state === 'missing' && <><br /><small className="muted">{month(t.expected_month)} due</small></>}</td>
            <td className="hide-sm small">{p.uploaded_at ? <>{dateTime(p.uploaded_at)}<br /><span className="muted">{p.source === 'update' ? p.uploaded_by_name : SOURCE[p.source]}</span></> : <span className="muted">—</span>}</td>
            <td className="num hide-sm">{p.genset_count}</td>
            <td>{can('manager') && canWriteIsland({ id: p.island_id, atoll_id: p.atoll_id }) && Number(p.genset_count) > 0 &&
              <button className={`btn small ${missing(p.state) ? 'primary' : 'ghost'}`} onClick={() => setOpen(p.facility_id)}>Update</button>}</td>
          </tr>)}</tbody>
        </table></div>
      </Card>;
    }}</Async>
    {open && <GensetUpdateForm facilityId={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); tracker.reload(); }} />}
  </>;
}

// One powerhouse's update: a row per genset, starting from its last figures.
export function GensetUpdateForm({ facilityId, onClose, onSaved }) {
  const state = useApi(`/facilities/${facilityId}/genset-update`);
  return <Modal title="Monthly genset update" onClose={onClose}>
    <Async state={state}>{(d) => <UpdateRows data={d} onClose={onClose} onSaved={onSaved} />}</Async>
  </Modal>;
}

function UpdateRows({ data: d, onClose, onSaved }) {
  const [rows, setRows] = useState(() => d.gensets.map((g) => ({
    id: g.id, tag: g.tag, model: g.make_model, status: g.status, last: g.total_hours == null ? null : Number(g.total_hours), lastMonth: g.report_month,
    total_hours: '', meter_replaced: false, status: g.status === 'unknown' ? 'running' : g.status, faultLevel: g.fault_level || 'none', fault: g.fault_note || '',
    needs_overhaul: !!g.needs_overhaul, alt_needs_service: !!g.alt_needs_service, skip: g.status === 'disconnected',
  })));
  const set = (i, change) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...change } : r)));
  const save = useSubmit(async () => {
    const items = rows.filter((r) => !r.skip).map((r) => ({
      asset_id: r.id, total_hours: Number(r.total_hours), meter_replaced: r.meter_replaced || undefined, status: r.status,
      fault_level: r.faultLevel, fault: r.faultLevel === 'none' ? null : r.fault.trim() || null,
      needs_overhaul: r.needs_overhaul, alt_needs_service: r.alt_needs_service,
    }));
    if (!items.length) throw new Error('Include at least one genset');
    const blank = rows.find((r) => !r.skip && r.total_hours === '');
    if (blank) throw new Error(`Genset ${blank.tag}: enter its running hours`);
    await api(`/facilities/${d.powerhouse.id}/genset-update`, { method: 'POST', body: { items } });
    onSaved();
  });
  const ph = d.powerhouse;
  return <form className="form" onSubmit={(e) => { e.preventDefault(); save.submit(); }}>
    <p className="wide"><strong>{ph.atoll_code} · {ph.island_name}</strong> · {ph.name}
      <br /><span className="muted small">{ph.report_month ? `Last update: ${month(ph.report_month)}${ph.updated_by_name ? ` by ${ph.updated_by_name}` : ''}` : 'No update yet'}. This update is for {month(`${d.today.slice(0, 7)}-01`)}.</span></p>
    <ErrorBox error={save.error} />
    <div className="table-scroll wide"><table className="update-table">
      <thead><tr><th>Genset</th><th className="num">Running hours</th><th>Status</th><th>Faults</th><th>Needs</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r.id} className={r.skip ? 'muted' : ''}>
        <td><strong>G{r.tag}</strong>{r.model && <><br /><small className="muted">{r.model}</small></>}
          {r.status === 'disconnected' && <><br /><label className="check small"><input type="checkbox" checked={!r.skip} onChange={(e) => set(i, { skip: !e.target.checked })} /> include (disconnected)</label></>}</td>
        <td className="num"><input type="number" min="0" step="0.1" className="qty" disabled={r.skip} required={!r.skip} value={r.total_hours}
          onChange={(e) => set(i, { total_hours: e.target.value })} placeholder={r.last != null ? num(r.last) : ''} aria-label={`G${r.tag} running hours`} />
          {r.last != null && <><br /><small className="muted">last {num(r.last)}{r.lastMonth && ` (${month(r.lastMonth)})`}</small></>}
          {r.last != null && r.total_hours !== '' && Number(r.total_hours) < r.last && <><br /><label className="check small warn-text">
            <input type="checkbox" checked={r.meter_replaced} onChange={(e) => set(i, { meter_replaced: e.target.checked })} /> meter replaced</label></>}</td>
        <td><Select value={r.status} disabled={r.skip} onChange={(v) => set(i, ['down', 'maintenance'].includes(r.status) && ['running', 'standby'].includes(v) ? { status: v, faultLevel: 'none', fault: '' } : { status: v })}
          options={STATUSES.map((k) => [k, ASSET_STATUS[k].label])} aria-label={`G${r.tag} status`} /></td>
        <td><Select value={r.faultLevel} disabled={r.skip} onChange={(v) => set(i, { faultLevel: v })}
          options={Object.entries(FAULTS).map(([k, f]) => [k, f.label])} aria-label={`G${r.tag} faults`} />
          {r.faultLevel !== 'none' && <input value={r.fault} disabled={r.skip} required={!r.skip} maxLength="2000"
            onChange={(e) => set(i, { fault: e.target.value })} placeholder="What is wrong" aria-label={`G${r.tag} fault`} />}</td>
        <td className="small"><label className="check"><input type="checkbox" disabled={r.skip} checked={r.needs_overhaul} onChange={(e) => set(i, { needs_overhaul: e.target.checked })} /> Overhaul</label>
          <label className="check"><input type="checkbox" disabled={r.skip} checked={r.alt_needs_service} onChange={(e) => set(i, { alt_needs_service: e.target.checked })} /> Alternator service</label></td>
      </tr>)}</tbody>
    </table></div>
    <p className="muted small wide">Setting a genset down opens repair work; bringing one back to running clears its faults unless you give new ones.
      Record overhauls and other services on the genset (or by completing the work order) so due dates stay right.</p>
    <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={save.busy}>Save update</button></div>
  </form>;
}
