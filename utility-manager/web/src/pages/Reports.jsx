import { useState } from 'react';
import { csvUrl, qs } from '../api.js';
import { Async, Card, Empty, Field, PageHead, Select } from '../components/ui.jsx';
import { SERVICES, localDate, num } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

export default function Reports() {
  const [filters, setFilter] = useFilters({ month: localDate(-1).slice(0, 7), service: 'electricity' });
  const atolls = useApi('/atolls');
  const params = { month: filters.month, service: filters.service, atoll_id: filters.atoll_id };
  const state = useApi(`/reports/monthly${qs(params)}`);

  return <>
    <PageHead title="Monthly operations report" actions={<a className="btn ghost" href={csvUrl('/reports/monthly', params)}>Export CSV</a>} />
    <div className="filters">
      <input type="month" value={filters.month} max={localDate(0).slice(0, 7)} onChange={(e) => setFilter('month', e.target.value)} aria-label="Month" />
      <Select value={filters.service} onChange={(v) => setFilter('service', v)} options={Object.entries(SERVICES).map(([k, s]) => [k, s.label])} aria-label="Service" />
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls" options={(atolls.data || []).map((a) => [a.id, a.code])} aria-label="Atoll" />
    </div>
    <Async state={state}>{(r) => (
      <Card>
        {r.rows.length === 0 ? <Empty>No {SERVICES[r.service].label.toLowerCase()} facilities.</Empty> :
          <div className="table-scroll">
            <table className="report">
              <thead><tr>
                <th>Island / facility</th><th className="num">Days</th>
                {r.metrics.map((m) => <th key={m.code} className="num">{m.name}<br /><span className="muted">{m.unit}{m.aggregation !== 'sum' && ` · ${m.aggregation}`}</span></th>)}
                {r.kpis.map((k) => <th key={k.key} className="num kpi">{k.label}</th>)}
                <th className="num">Incidents</th><th className="num">Outage h</th>
              </tr></thead>
              <tbody>{r.rows.map((row) => <tr key={row.facility_id} className={row.days_reported ? '' : 'inactive'}>
                <td><strong>{row.atoll_code} · {row.island_name}</strong><br /><small className="muted">{row.facility_name}</small></td>
                <td className="num">{row.days_reported}</td>
                {r.metrics.map((m) => <td key={m.code} className="num">{num(row.values[m.code], 1)}</td>)}
                {r.kpis.map((k) => <td key={k.key} className="num kpi">{num(row.kpis[k.key], 2)}</td>)}
                <td className="num">{row.incidents}</td><td className="num">{num(row.outage_hours, 1)}</td>
              </tr>)}</tbody>
              <tfoot><tr>
                <th>Total</th><th />
                {r.metrics.map((m) => <th key={m.code} className="num">{m.aggregation === 'sum' ? num(r.rows.reduce((s, x) => s + (x.values[m.code] || 0), 0), 0) : ''}</th>)}
                {r.kpis.map((k) => <th key={k.key} />)}
                <th className="num">{r.rows.reduce((s, x) => s + x.incidents, 0)}</th>
                <th className="num">{num(r.rows.reduce((s, x) => s + x.outage_hours, 0), 1)}</th>
              </tr></tfoot>
            </table>
          </div>}
      </Card>
    )}</Async>
    <RawExport />
  </>;
}

function RawExport() {
  const [range, setRange] = useState({ from: `${localDate(-1).slice(0, 7)}-01`, to: localDate(-1) });
  return (
    <Card title="Export raw daily readings">
      <div className="filters">
        <Field label="From"><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="To"><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        <a className="btn" href={csvUrl('/readings', range)}>Download CSV</a>
      </div>
      <p className="muted small">One row per facility, day and measurement — opens directly in Excel.</p>
    </Card>
  );
}
