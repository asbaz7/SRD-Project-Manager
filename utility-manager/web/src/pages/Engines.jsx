// Every genset at a glance: condition from the latest report, overhaul and
// alternator figures, flags and ongoing work. One click filters.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, csvUrl, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, EngineState, Empty, ErrorBox, Flags, Modal, PageHead, Select } from '../components/ui.jsx';
import { date, month, num } from '../format.js';
import { useApi, useFilters, useRowLink, useSubmit } from '../hooks.js';

const CHIPS = [
  ['', '', 'All engines', 'total'],
  ['condition', 'faults', 'Faults', null],
  ['condition', 'not_running', 'Not running', 'not_running'],
  ['condition', 'major_fault', 'Major fault', 'major_fault'],
  ['condition', 'minor_fault', 'Minor fault', 'minor_fault'],
  ['flag', 'overhaul', 'Overhaul due', 'overhaul_due'],
  ['flag', 'alternator', 'Alternator service', 'alt_service_due'],
  ['flag', 'work', 'Work in progress', 'with_work'],
  ['flag', 'stale', 'Report out of date', null],
];

export default function Engines({ embedded }) {
  const [filters, setFilter] = useFilters({ sort: 'island' });
  const atolls = useApi('/atolls');
  const rowLink = useRowLink();
  const rowProps = (e) => {
    const p = rowLink(`/assets/${e.id}`);
    return { ...p, className: `${p.className}${e.condition === 'not_running' || e.condition === 'major_fault' ? ' attention' : ''}` };
  };
  const params = { atoll_id: filters.atoll_id, condition: filters.condition, flag: filters.flag, q: filters.q, sort: filters.sort };
  const state = useApi(`/engines${qs(params)}`);
  const summary = useApi(`/engines${qs({ atoll_id: filters.atoll_id })}`); // counts for the chips, unfiltered

  const pick = (key, value) => setFilter({ condition: key === 'condition' ? value : '', flag: key === 'flag' ? value : '' });
  const active = (key, value) => (key ? filters[key] === value : !filters.condition && !filters.flag);

  return <>
    {!embedded && <PageHead title="Engines" icon="electricity" tone="electricity" />}
    <div className="chips">
      {CHIPS.map(([key, value, lab, countKey]) => {
        const n = countKey && summary.data?.summary[countKey];
        return <button key={lab} className={`chip ${active(key, value) ? 'on' : ''}`} onClick={() => pick(key, value)}>
          {lab}{n != null && <strong>{n}</strong>}
        </button>;
      })}
    </div>
    <div className="filters">
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
        options={(atolls.data || []).map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />
      <Select value={filters.sort} onChange={(v) => setFilter('sort', v)} aria-label="Sort"
        options={{ island: 'Sort: island', condition: 'Sort: worst condition first', hours_since_overhaul: 'Sort: most hours since overhaul', total_hours: 'Sort: most running hours', last_overhaul: 'Sort: oldest overhaul first', last_alt_service: 'Sort: oldest alternator service first', next_service: 'Sort: next service soonest' }} />
      <input type="search" placeholder="Search island, model, serial, fault…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
      <a className="btn ghost" href={csvUrl('/engines', params)}>Export CSV</a>
    </div>
    <Intervals onSaved={() => { state.reload(); summary.reload(); }} />
    <Async state={state}>{(d) => (
      <Card>
        {d.engines.length === 0 ? <Empty>No engines match.</Empty> :
          <div className="table-scroll">
            <table>
              <thead><tr>
                <th>Engine</th><th>Condition</th><th className="hide-sm">Fault / notes</th>
                <th className="num">Since overhaul</th><th className="num hide-sm">Total hours</th>
                <th className="hide-sm">Last overhaul</th><th className="hide-sm">Alternator serviced</th><th className="hide-sm">Report</th>
              </tr></thead>
              <tbody>{d.engines.map((e) => <tr key={e.id} {...rowProps(e)}>
                <td className="wrap">
                  <Link to={`/assets/${e.id}`}><strong>{e.atoll_code} · {e.island_name} · G{e.tag}</strong></Link><br />
                  <small className="muted">{e.make_model || '—'}{e.rated_capacity ? ` · ${num(e.rated_capacity)} kW` : ''}</small>
                  <div><Flags e={e} /></div>
                </td>
                <td><EngineState e={e} /></td>
                <td className="wrap hide-sm small">{(e.condition_source === 'status' ? e.condition_note : e.fault) || <span className="muted">—</span>}
                  {e.condition_source === 'status' && e.fault && <><br /><span className="muted">Report: {e.fault}</span></>}</td>
                <td className="num">{e.hours_since_overhaul != null ? `${num(e.hours_since_overhaul)} h` : '—'}
                  {e.hours_to_overhaul != null && <><br /><small className={e.hours_to_overhaul <= 0 ? 'bad' : 'muted'}>{e.hours_to_overhaul <= 0 ? `${num(-e.hours_to_overhaul)} h over` : `${num(e.hours_to_overhaul)} h to go`}</small></>}</td>
                <td className="num hide-sm">{e.total_hours != null ? num(e.total_hours) : '—'}</td>
                <td className="hide-sm small nowrap">{date(e.last_overhaul_on)}</td>
                <td className="hide-sm small nowrap">{date(e.last_alt_service_on)}</td>
                <td className={`hide-sm small nowrap ${e.report_stale ? 'bad' : 'muted'}`}>{month(e.report_month)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        <p className="muted small">{d.engines.length} engine{d.engines.length === 1 ? '' : 's'} · condition and hours from the latest monthly report</p>
      </Card>
    )}</Async>
  </>;
}

// When overhauls and alternator services fall due by rule: one line, with
// an editor for technical managers.
function Intervals({ onSaved }) {
  const { can, technical } = useAuth();
  const state = useApi('/service-intervals');
  const [editing, setEditing] = useState(false);
  const r = state.data?.region;
  if (!r) return null;
  const models = state.data.models;
  return <p className="muted small">
    Due by rule: overhaul every {r.overhaul_hours ? `${num(r.overhaul_hours)} running hours` : '— (not set)'} · alternator service every {r.alt_service_months ? `${r.alt_service_months} months` : '— (not set)'}
    {models.length > 0 && ` · ${models.length} model${models.length === 1 ? '' : 's'} with their own`}. A date set on a genset, or the island's tick on its report, counts too.
    {can('manager') && technical && <> <button className="link" onClick={() => setEditing(true)}>Change</button></>}
    {editing && <IntervalForm data={state.data} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); state.reload(); onSaved(); }} />}
  </p>;
}

function IntervalForm({ data, onClose, onSaved }) {
  const str = (v) => (v == null ? '' : String(Number(v)));
  const [region, setRegion] = useState({ overhaul_hours: str(data.region.overhaul_hours), alt_service_months: str(data.region.alt_service_months) });
  const [models, setModels] = useState(data.models.map((m) => ({ model_match: m.model_match, overhaul_hours: str(m.overhaul_hours), alt_service_months: str(m.alt_service_months) })));
  const n = (v) => (v === '' ? null : Number(v));
  const { submit, busy, error } = useSubmit(async () => {
    await api('/service-intervals', { method: 'PUT', body: {
      region: { overhaul_hours: n(region.overhaul_hours), alt_service_months: n(region.alt_service_months) },
      models: models.filter((m) => m.model_match.trim()).map((m) => ({ model_match: m.model_match.trim(), overhaul_hours: n(m.overhaul_hours), alt_service_months: n(m.alt_service_months) })),
    } });
    onSaved();
  });
  const setModel = (i, k, v) => setModels(models.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  return <Modal title="Service intervals" onClose={onClose}>
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <ErrorBox error={error} />
      <p className="muted small wide">Next due = the last one plus the interval. A model's own interval applies to every genset whose make / model contains its text (e.g. KTA38); leave a box empty to use the region's.</p>
      <table className="wide"><thead><tr><th>Applies to</th><th className="num">Overhaul every (h)</th><th className="num">Alternator every (months)</th><th /></tr></thead>
        <tbody>
          <tr><td><strong>Whole region</strong></td>
            <td><input type="number" min="1" step="1" value={region.overhaul_hours} onChange={(e) => setRegion({ ...region, overhaul_hours: e.target.value })} aria-label="Region overhaul hours" /></td>
            <td><input type="number" min="1" step="1" value={region.alt_service_months} onChange={(e) => setRegion({ ...region, alt_service_months: e.target.value })} aria-label="Region alternator months" /></td><td /></tr>
          {models.map((m, i) => <tr key={i}>
            <td><input required minLength="2" maxLength="60" value={m.model_match} placeholder="e.g. KTA38" onChange={(e) => setModel(i, 'model_match', e.target.value)} aria-label="Model" /></td>
            <td><input type="number" min="1" step="1" value={m.overhaul_hours} placeholder={region.overhaul_hours} onChange={(e) => setModel(i, 'overhaul_hours', e.target.value)} aria-label="Overhaul hours" /></td>
            <td><input type="number" min="1" step="1" value={m.alt_service_months} placeholder={region.alt_service_months} onChange={(e) => setModel(i, 'alt_service_months', e.target.value)} aria-label="Alternator months" /></td>
            <td><button type="button" className="btn ghost small" onClick={() => setModels(models.filter((_, j) => j !== i))} aria-label="Remove">✕</button></td>
          </tr>)}
        </tbody></table>
      <div className="form-actions">
        <button type="button" className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => setModels([...models, { model_match: '', overhaul_hours: '', alt_service_months: '' }])}>Add a model</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save</button>
      </div>
    </form>
  </Modal>;
}
