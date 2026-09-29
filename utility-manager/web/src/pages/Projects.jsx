import { Link } from 'react-router-dom';
import { csvUrl, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, PageHead, Pager, Progress, ProjectState, Select, Service } from '../components/ui.jsx';
import { PROJECT_STATES, SERVICES, date } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

export default function Projects() {
  const { can } = useAuth();
  const [filters, setFilter] = useFilters();
  const atolls = useApi('/atolls');
  const params = { status: filters.status, service: filters.service, atoll_id: filters.atoll_id, island_id: filters.island_id, q: filters.q, offset: filters.offset };
  const state = useApi(`/projects${qs(params)}`);

  return <>
    <PageHead title="Projects" actions={<>
      <a className="btn ghost" href={csvUrl('/projects', { ...params, offset: undefined })}>Export CSV</a>
      {can('manager') && <Link className="btn primary" to={`/projects/new${qs({ island_id: filters.island_id })}`}>New project</Link>}
    </>} />
    <div className="filters">
      <Select value={filters.status} onChange={(v) => setFilter('status', v)} placeholder="Any status" options={{ active: 'Active (not finished)', ...PROJECT_STATES }} aria-label="Status" />
      <Select value={filters.service} onChange={(v) => setFilter('service', v)} placeholder="All services" options={Object.entries(SERVICES).map(([k, s]) => [k, s.label])} aria-label="Service" />
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls" options={(atolls.data || []).map((a) => [a.id, a.code])} aria-label="Atoll" />
      <input type="search" placeholder="Search…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
      {filters.island_id && <button className="btn ghost small" onClick={() => setFilter('island_id', '')}>✕ island filter</button>}
    </div>
    <Async state={state}>{(page) => (
      <Card>
        {page.items.length === 0 ? <Empty>No projects match.</Empty> :
          <table>
            <thead><tr><th>Project</th><th>Status</th><th>Progress</th><th className="hide-sm">Target</th><th className="hide-sm">Last update</th></tr></thead>
            <tbody>{page.items.map((p) => <tr key={p.id}>
              <td className="wrap"><Link to={`/projects/${p.id}`}><strong>{p.title}</strong></Link><br />
                <small className="muted">{p.ref} · <Service value={p.service} short /> {p.island_name ? `${p.atoll_code} · ${p.island_name}` : 'Regional'}{p.contractor && ` · ${p.contractor}`}</small></td>
              <td><ProjectState value={p.status} /></td>
              <td><Progress value={p.progress_pct} /></td>
              <td className={`nowrap hide-sm ${p.overdue ? 'bad' : ''}`}>{date(p.target_date)}{p.overdue && ' ⚠'}</td>
              <td className="nowrap hide-sm muted">{date(p.last_update_at)}</td>
            </tr>)}</tbody>
          </table>}
        <Pager page={page} onOffset={(o) => setFilter('offset', o)} />
      </Card>
    )}</Async>
  </>;
}
