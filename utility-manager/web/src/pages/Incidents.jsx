import { Link } from 'react-router-dom';
import { csvUrl, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, PageHead, Pager, Select, Service, Severity } from '../components/ui.jsx';
import { INCIDENT_CATEGORIES, SERVICES, SEVERITIES, dateTime, duration } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

export default function Incidents() {
  const { can } = useAuth();
  const [filters, setFilter] = useFilters();
  const atolls = useApi('/atolls');
  const params = {
    status: filters.status, service: filters.service, atoll_id: filters.atoll_id, island_id: filters.island_id,
    category: filters.category, severity: filters.severity, from: filters.from, to: filters.to, q: filters.q, offset: filters.offset,
  };
  const state = useApi(`/incidents${qs(params)}`);

  return <>
    <PageHead title="Incidents" actions={<>
      <a className="btn ghost" href={csvUrl('/incidents', { ...params, offset: undefined })}>Export CSV</a>
      {can('operator') && <Link className="btn primary" to={`/incidents/new${qs({ island_id: filters.island_id })}`}>Report incident</Link>}
    </>} />
    <div className="filters">
      <Select value={filters.status} onChange={(v) => setFilter('status', v)} placeholder="Any status" options={{ open: 'Open', resolved: 'Resolved', closed: 'Closed' }} aria-label="Status" />
      <Select value={filters.service} onChange={(v) => setFilter('service', v)} placeholder="All services" options={Object.entries(SERVICES).map(([k, s]) => [k, s.label])} aria-label="Service" />
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls" options={(atolls.data || []).map((a) => [a.id, a.code])} aria-label="Atoll" />
      <Select value={filters.category} onChange={(v) => setFilter('category', v)} placeholder="All categories" options={INCIDENT_CATEGORIES} aria-label="Category" />
      <Select value={filters.severity} onChange={(v) => setFilter('severity', v)} placeholder="Any severity" options={SEVERITIES} aria-label="Severity" />
      <input type="date" value={filters.from || ''} onChange={(e) => setFilter('from', e.target.value)} aria-label="From" title="From" />
      <input type="date" value={filters.to || ''} onChange={(e) => setFilter('to', e.target.value)} aria-label="To" title="To" />
      <input type="search" placeholder="Search…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
      {filters.island_id && <button className="btn ghost small" onClick={() => setFilter('island_id', '')}>✕ island filter</button>}
    </div>
    <Async state={state}>{(page) => (
      <Card>
        {page.items.length === 0 ? <Empty>No incidents match.</Empty> :
          <table>
            <thead><tr><th>Ref</th><th>Incident</th><th>Severity</th><th className="hide-sm">Started</th><th className="hide-sm">Duration</th><th>Status</th></tr></thead>
            <tbody>{page.items.map((x) => <tr key={x.id}>
              <td className="nowrap"><Link to={`/incidents/${x.id}`}>{x.ref}</Link></td>
              <td className="wrap"><Link to={`/incidents/${x.id}`}>{x.title}</Link><br />
                <small className="muted"><Service value={x.service} short /> {x.atoll_code} · {x.island_name}{x.asset_tag && ` · ${x.asset_kind} ${x.asset_tag}`} · {INCIDENT_CATEGORIES[x.category]}</small></td>
              <td><Severity value={x.severity} /></td>
              <td className="nowrap hide-sm">{dateTime(x.started_at)}</td>
              <td className="nowrap hide-sm">{duration(x.duration_minutes)}</td>
              <td><span className={`pill inc-${x.status}`}>{x.status}</span></td>
            </tr>)}</tbody>
          </table>}
        <Pager page={page} onOffset={(o) => setFilter('offset', o)} />
      </Card>
    )}</Async>
  </>;
}
