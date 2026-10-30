// Work, as the TV board's task view: one service at a time (electricity,
// water and sewerage work are never mixed), state tabs, figures, and a card
// per island with its jobs, the most pressing first.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { csvUrl, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, PageHead, Pager, Select } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { IslandWorkCards } from '../components/AreaWork.jsx';
import { SERVICES, WORK_KINDS, WORK_STATES, num } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

const TABS = [['open', 'Ongoing'], ['overdue', 'Overdue'], ['awaiting_parts', 'Awaiting parts'], ['completed', 'Completed'], ['all', 'All']];
const FILTERS = ['atoll_id', 'unit', 'kind', 'assignee', 'q', 'island_id'];
const WEEK = 7 * 86400000;

export default function Work() {
  const { can, technical, user } = useAuth();
  const [filters, setFilter] = useFilters({ status: 'open', service: 'electricity' });
  const navigate = useNavigate();
  const atolls = useApi('/atolls');
  const units = useApi('/units');
  const people = useApi('/users/directory');
  const params = { status: filters.status, service: filters.service, atoll_id: filters.atoll_id, island_id: filters.island_id, kind: filters.kind, assignee: filters.assignee, unit: filters.unit, q: filters.q, offset: filters.offset, limit: 200 };
  const state = useApi(`/work${qs(params)}`);
  const counts = state.data?.counts;
  const filtered = FILTERS.some((k) => filters[k]);
  const chosen = FILTERS.filter((k) => k !== 'q' && filters[k]).length;
  const [showFilters, setShowFilters] = useState(false);
  const tabs = TABS.some(([k]) => k === filters.status) ? TABS : [...TABS, [filters.status, WORK_STATES[filters.status] || filters.status]];
  const svc = SERVICES[filters.service];

  return <>
    <PageHead title="Work" icon="work" subtitle="Repairs, overhauls, services and genset moves, one service at a time" actions={<>
      <a className="btn ghost with-icon" href={csvUrl('/work', { ...params, offset: undefined, limit: undefined })}><Icon name="download" size={16} /> Export CSV</a>
      {can('manager') && (technical || user.headOf?.length > 0)
        && <Link className="btn primary" to={`/work/new${qs({ island_id: filters.island_id, service: filters.service })}`}>Log work</Link>}
    </>} />

    {/* One service at a time: its work is never mixed with another's. */}
    <nav className="svc-tabs" aria-label="Service">
      {Object.entries(SERVICES).map(([k, s]) => <button key={k} type="button" className={`svc-tab ${k}${filters.service === k ? ' on' : ''}`}
        aria-current={filters.service === k ? 'page' : undefined} onClick={() => setFilter({ service: k, offset: '' })}>
        <span className={`svc-badge ${k}`}><Icon name={k} size={15} /></span>{s.label}
        {counts?.by_service && <span className="count">{num(counts.by_service[k] || 0)} open</span>}
      </button>)}
    </nav>

    <nav className="tabs work-tabs" aria-label="Work by state">
      {tabs.map(([k, label]) => <button key={k} type="button" className={`tab${filters.status === k ? ' active' : ''}${k === 'overdue' && counts?.overdue ? ' alert' : ''}`}
        aria-current={filters.status === k ? 'page' : undefined} onClick={() => setFilter({ status: k, offset: '' })}>
        {label}{counts?.[k] != null && <span className="count">{counts[k]}</span>}
      </button>)}
    </nav>

    <div className="work-toolbar">
      <label className="search">
        <Icon name="search" size={16} />
        <input type="search" placeholder="Search title, island or person" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search work" />
      </label>
      <button type="button" className="btn filters-toggle" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
        Filters{chosen > 0 && <span className="count">{chosen}</span>}</button>
      <div className={`work-filters${showFilters ? ' open' : ''}`}>
        <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="Atoll" options={(atolls.data || []).map((a) => [a.id, a.code])} aria-label="Atoll" />
        <Select value={filters.unit} onChange={(v) => setFilter('unit', v)} placeholder="Unit" aria-label="Unit"
          options={[['mine', 'My unit'], ...(units.data || []).map((u) => [String(u.id), u.name])]} />
        <Select value={filters.kind} onChange={(v) => setFilter('kind', v)} placeholder="Type" options={WORK_KINDS} aria-label="Type" />
        <Select value={filters.assignee} onChange={(v) => setFilter('assignee', v)} placeholder="Person" aria-label="Assigned to"
          options={[['me', 'Assigned to me'], ...(people.data || []).map((p) => [p.id, p.full_name])]} />
      </div>
      {filtered && <button type="button" className="btn ghost small" onClick={() => setFilter(Object.fromEntries(FILTERS.map((k) => [k, ''])))}>Clear filters</button>}
    </div>

    <Async state={state}>{(page) => {
      const items = page.items;
      const now = Date.now();
      const open = items.filter((w) => !['completed', 'cancelled'].includes(w.status));
      const soon = open.filter((w) => !w.overdue && w.target_on && new Date(`${w.target_on}T23:59:59`) - now <= WEEK).length;
      const tiles = [
        [num(open.length), filters.status === 'completed' ? 'Still open' : 'Open', 'prog'],
        [num(new Set(items.map((w) => w.island_id)).size), 'Locations', 'none'],
        [num(open.filter((w) => w.overdue).length), 'Overdue', open.some((w) => w.overdue) ? 'over' : 'none'],
        [num(soon), 'Due in 7 days', soon ? 'hold' : 'none'],
      ];
      return <section className="glass work-board" aria-label={`${svc?.label} work`}>
        <div className="area-tiles">{tiles.map(([v, l, t]) => <div key={l} className={`area-tile t-${t}`}><b>{v}</b><span>{l}</span></div>)}</div>
        {items.length === 0
          ? <div className="work-empty"><strong>No {svc?.label.toLowerCase()} work {filters.status === 'open' ? 'in progress' : 'matches'}.</strong>
            {filtered && <p className="muted small">Try fewer filters, or <button type="button" className="link" onClick={() => setFilter(Object.fromEntries(FILTERS.map((k) => [k, ''])))}>clear them</button>.</p>}</div>
          : <IslandWorkCards work={items} onIsland={(i) => navigate(`/islands?island=${i.id}`)} />}
        {items.length > 0 && <Pager page={page} onOffset={(o) => setFilter('offset', o)} />}
      </section>;
    }}</Async>
  </>;
}
