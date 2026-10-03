import { Link } from 'react-router-dom';
import { csvUrl, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, PageHead, Pager, Select, WorkState } from '../components/ui.jsx';
import { ASSET_KINDS, WORK_KINDS, WORK_STATES, date, dateTime } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

export default function Work() {
  const { can } = useAuth();
  const [filters, setFilter] = useFilters({ status: 'open' });
  const atolls = useApi('/atolls');
  const params = { status: filters.status, atoll_id: filters.atoll_id, island_id: filters.island_id, kind: filters.kind, q: filters.q, offset: filters.offset };
  const state = useApi(`/work${qs(params)}`);

  return <>
    <PageHead title="Work" actions={<>
      <a className="btn ghost" href={csvUrl('/work', { ...params, offset: undefined })}>Export CSV</a>
      {can('manager') && <Link className="btn primary" to={`/work/new${qs({ island_id: filters.island_id })}`}>Log work</Link>}
    </>} />
    <p className="muted small">Repairs, overhauls, alternator services and other work on gensets and islands. Post updates as it goes; when work on an engine is completed it is added to that engine's maintenance history.</p>
    <div className="filters">
      <Select value={filters.status} onChange={(v) => setFilter('status', v)} options={{ open: 'Ongoing', all: 'All', ...WORK_STATES }} aria-label="Status" />
      <Select value={filters.kind} onChange={(v) => setFilter('kind', v)} placeholder="All types" options={WORK_KINDS} aria-label="Type" />
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls" options={(atolls.data || []).map((a) => [a.id, a.code])} aria-label="Atoll" />
      <input type="search" placeholder="Search…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
      {filters.island_id && <button className="btn ghost small" onClick={() => setFilter('island_id', '')}>✕ island filter</button>}
    </div>
    <Async state={state}>{(page) => (
      <Card>
        {page.items.length === 0 ? <Empty>{filters.status === 'open' ? 'No work in progress.' : 'No work matches.'}</Empty> :
          <table>
            <thead><tr><th>Work</th><th>Status</th><th className="hide-sm">Latest update</th><th className="hide-sm">Target</th></tr></thead>
            <tbody>{page.items.map((w) => <tr key={w.id}>
              <td className="wrap"><Link to={`/work/${w.id}`}><strong>{w.title}</strong></Link><br />
                <small className="muted">{w.ref} · {WORK_KINDS[w.kind]} · {w.atoll_code} · {w.island_name}{w.asset_tag && ` · ${ASSET_KINDS[w.asset_kind]} ${w.asset_tag}`}{w.assigned_to && ` · ${w.assigned_to}`}</small></td>
              <td><WorkState value={w.status} /></td>
              <td className="wrap hide-sm small">{w.last_update || <span className="muted">—</span>}{w.last_update_at && <><br /><span className="muted">{dateTime(w.last_update_at)}</span></>}</td>
              <td className={`nowrap hide-sm small ${w.overdue ? 'bad' : ''}`}>{date(w.target_on)}{w.overdue && ' ⚠'}</td>
            </tr>)}</tbody>
          </table>}
        <Pager page={page} onOffset={(o) => setFilter('offset', o)} />
      </Card>
    )}</Async>
  </>;
}
