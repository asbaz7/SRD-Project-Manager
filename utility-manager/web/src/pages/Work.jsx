import { Link } from 'react-router-dom';
import { csvUrl, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, PageHead, Pager, Select, Service, WorkState } from '../components/ui.jsx';
import { ASSET_KINDS, SERVICES, WORK_KINDS, WORK_STATES, date, dateTime } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

export default function Work() {
  const { can, technical } = useAuth();
  const [filters, setFilter] = useFilters({ status: 'open' });
  const atolls = useApi('/atolls');
  const params = { status: filters.status, service: filters.service, atoll_id: filters.atoll_id, island_id: filters.island_id, kind: filters.kind, assignee: filters.assignee, q: filters.q, offset: filters.offset };
  const people = useApi('/users/directory');
  const state = useApi(`/work${qs(params)}`);

  return <>
    <PageHead title="Work" icon="work" subtitle="Repairs, overhauls, services and other work on assets and islands" actions={<>
      <a className="btn ghost" href={csvUrl('/work', { ...params, offset: undefined })}>Export CSV</a>
      {can('manager') && technical && <Link className="btn primary" to={`/work/new${qs({ island_id: filters.island_id, service: filters.service })}`}>Log work</Link>}
    </>} />
    <div className="filters">
      <Select value={filters.status} onChange={(v) => setFilter('status', v)} options={{ open: 'Ongoing', all: 'All', ...WORK_STATES }} aria-label="Status" />
      <Select value={filters.service} onChange={(v) => setFilter('service', v)} placeholder="All services" options={Object.entries(SERVICES).map(([k, s]) => [k, s.label])} aria-label="Service" />
      <Select value={filters.kind} onChange={(v) => setFilter('kind', v)} placeholder="All types" options={WORK_KINDS} aria-label="Type" />
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls" options={(atolls.data || []).map((a) => [a.id, a.code])} aria-label="Atoll" />
      <Select value={filters.assignee} onChange={(v) => setFilter('assignee', v)} placeholder="Anyone" aria-label="Assigned to"
        options={[['me', 'Assigned to me'], ...(people.data || []).map((p) => [p.id, p.full_name])]} />
      <input type="search" placeholder="Search…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
      {filters.island_id && <button className="btn ghost small" onClick={() => setFilter('island_id', '')}>✕ island filter</button>}
    </div>
    <Async state={state}>{(page) => (
      <Card>
        {page.items.length === 0 ? <Empty>{filters.status === 'open' ? 'No work in progress.' : 'No work matches.'}</Empty> :
          <table>
            <thead><tr><th>Work</th><th>Status</th><th className="hide-sm">Assigned to</th><th className="hide-sm">Latest update</th><th className="hide-sm">Target</th></tr></thead>
            <tbody>{page.items.map((w) => <tr key={w.id}>
              <td className="wrap"><Link to={`/work/${w.id}`}><strong>{w.title}</strong></Link><br />
                <small className="muted"><Service value={w.service} short />{w.ref} · {WORK_KINDS[w.kind]} · {w.atoll_code} · {w.island_name}{w.kind === 'relocation' && ` → ${w.dest_atoll_code} · ${w.dest_island_name}`}{w.asset_tag && ` · ${ASSET_KINDS[w.asset_kind]} ${w.asset_tag}`}{w.asset_model && ` · ${w.asset_model}`}</small></td>
              <td><WorkState value={w.status} /></td>
              <td className="hide-sm small">{[w.assigned_user_name, w.assigned_to].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
              <td className="wrap hide-sm small">{w.last_update || <span className="muted">—</span>}{w.last_update_at && <><br /><span className="muted">{dateTime(w.last_update_at)}</span></>}</td>
              <td className={`nowrap hide-sm small ${w.overdue ? 'bad' : ''}`}>{date(w.target_on)}{w.overdue && ' ⚠'}</td>
            </tr>)}</tbody>
          </table>}
        <Pager page={page} onOffset={(o) => setFilter('offset', o)} />
      </Card>
    )}</Async>
  </>;
}
