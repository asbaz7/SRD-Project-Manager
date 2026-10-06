// Every genset at a glance: condition from the latest report, overhaul and
// alternator figures, flags and ongoing work. One click filters.
import { Link } from 'react-router-dom';
import { csvUrl, qs } from '../api.js';
import { Async, Card, EngineState, Empty, Flags, PageHead, Select } from '../components/ui.jsx';
import { date, month, num } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

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
        options={{ island: 'Sort: island', condition: 'Sort: worst condition first', hours_since_overhaul: 'Sort: most hours since overhaul', total_hours: 'Sort: most running hours', last_overhaul: 'Sort: oldest overhaul first' }} />
      <input type="search" placeholder="Search island, model, serial, fault…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
      <a className="btn ghost" href={csvUrl('/engines', params)}>Export CSV</a>
    </div>
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
              <tbody>{d.engines.map((e) => <tr key={e.id} className={e.condition === 'not_running' || e.condition === 'major_fault' ? 'attention' : ''}>
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
