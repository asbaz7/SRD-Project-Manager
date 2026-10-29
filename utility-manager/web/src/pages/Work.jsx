// Work: repairs, overhauls, services and genset moves. Tabs by state (with
// counts), one search and filter bar, and a list where each work item is a
// row you can open: what and where, its state and who has it, and the latest
// update in a line or two.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { csvUrl, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, PageHead, Pager, Select, WorkState } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { SERVICES, WORK_KINDS, WORK_STATES, assetLabel, date, since } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

const TABS = [['open', 'Ongoing'], ['overdue', 'Overdue'], ['awaiting_parts', 'Awaiting parts'], ['completed', 'Completed'], ['all', 'All']];
const FILTERS = ['service', 'atoll_id', 'unit', 'kind', 'assignee', 'q', 'island_id'];

export default function Work() {
  const { can, technical, user } = useAuth();
  const [filters, setFilter] = useFilters({ status: 'open' });
  const atolls = useApi('/atolls');
  const units = useApi('/units');
  const people = useApi('/users/directory');
  const params = { status: filters.status, service: filters.service, atoll_id: filters.atoll_id, island_id: filters.island_id, kind: filters.kind, assignee: filters.assignee, unit: filters.unit, q: filters.q, offset: filters.offset };
  const state = useApi(`/work${qs(params)}`);
  const counts = state.data?.counts;
  const filtered = FILTERS.some((k) => filters[k]);
  const chosen = FILTERS.filter((k) => k !== 'q' && filters[k]).length;
  // On phones the filters fold away behind a button.
  const [showFilters, setShowFilters] = useState(false);
  // A state that isn't a tab (e.g. from a link: on hold) shows as one while chosen.
  const tabs = TABS.some(([k]) => k === filters.status) ? TABS : [...TABS, [filters.status, WORK_STATES[filters.status] || filters.status]];

  return <>
    <PageHead title="Work" icon="work" subtitle="Repairs, overhauls, services and genset moves" actions={<>
      <a className="btn ghost with-icon" href={csvUrl('/work', { ...params, offset: undefined })}><Icon name="download" size={16} /> Export CSV</a>
      {can('manager') && (technical || user.headOf?.length > 0)
        && <Link className="btn primary" to={`/work/new${qs({ island_id: filters.island_id, service: filters.service })}`}>Log work</Link>}
    </>} />

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
      <Select value={filters.service} onChange={(v) => setFilter('service', v)} placeholder="Service" options={Object.entries(SERVICES).map(([k, s]) => [k, s.label])} aria-label="Service" />
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="Atoll" options={(atolls.data || []).map((a) => [a.id, a.code])} aria-label="Atoll" />
      <Select value={filters.unit} onChange={(v) => setFilter('unit', v)} placeholder="Unit" aria-label="Unit"
        options={[['mine', 'My unit'], ...(units.data || []).map((u) => [String(u.id), u.name])]} />
      <Select value={filters.kind} onChange={(v) => setFilter('kind', v)} placeholder="Type" options={WORK_KINDS} aria-label="Type" />
      <Select value={filters.assignee} onChange={(v) => setFilter('assignee', v)} placeholder="Person" aria-label="Assigned to"
        options={[['me', 'Assigned to me'], ...(people.data || []).map((p) => [p.id, p.full_name])]} />
      </div>
      {filtered && <button type="button" className="btn ghost small" onClick={() => setFilter(Object.fromEntries(FILTERS.map((k) => [k, ''])))}>Clear filters</button>}
    </div>

    <Async state={state}>{(page) => <section className="glass work-list" aria-label="Work">
      {page.items.length === 0
        ? <div className="work-empty">
          <strong>{filters.status === 'overdue' ? 'Nothing overdue.' : filters.status === 'open' && !filtered ? 'No work in progress.' : 'No work matches.'}</strong>
          {filtered && <p className="muted small">Try fewer filters, or <button type="button" className="link" onClick={() => setFilter(Object.fromEntries(FILTERS.map((k) => [k, ''])))}>clear them</button>.</p>}
        </div>
        : <ul>{page.items.map((w) => <li key={w.id}><WorkRow w={w} /></li>)}</ul>}
      <div className="work-foot"><Pager page={page} onOffset={(o) => setFilter('offset', o)} /></div>
    </section>}</Async>
  </>;
}

function WorkRow({ w }) {
  const where = [`${w.atoll_code}. ${w.island_name}`, w.kind === 'relocation' && w.dest_island_name && `→ ${w.dest_atoll_code}. ${w.dest_island_name}`].filter(Boolean).join(' ');
  const asset = w.asset_tag && [assetLabel({ kind: w.asset_kind, tag: w.asset_tag }), w.asset_model].filter(Boolean).join(' · ');
  // Who has it: the person, then the unit (said once).
  const who = [...new Set([w.assigned_user_name, w.assigned_to, w.unit_name].filter(Boolean))];
  const open = !['completed', 'cancelled'].includes(w.status);
  return <Link to={`/work/${w.id}`} className={`work-row s-${w.status}${w.overdue ? ' late' : ''}`}>
    <div className="work-main">
      <div className="work-title"><span className="work-ref">{w.ref}</span><strong>{w.title}</strong></div>
      <div className="work-meta">
        <span className="bits"><span><span className={`svc-dot ${w.service}`} title={SERVICES[w.service]?.label} />{where}</span>{asset && <span>{asset}</span>}<span>{WORK_KINDS[w.kind] || w.kind}</span></span>
      </div>
      {w.last_update
        ? <p className="work-update"><span className="text">{w.last_update}</span>
          <span className="by">{[w.last_update_by, since(w.last_update_at)].filter(Boolean).join(' · ')}</span></p>
        : <p className="work-update none">No updates yet</p>}
    </div>
    <div className="work-side">
      <WorkState value={w.status} />
      {who.length > 0 && <span className="holder">{who.join(' · ')}</span>}
      {w.target_on && open && <span className={`due${w.overdue ? ' late' : ''}`}>{w.overdue ? 'Overdue · ' : 'Due '}{date(w.target_on)}</span>}
      {w.completed_on && !open && <span className="due">Done {date(w.completed_on)}</span>}
    </div>
  </Link>;
}
