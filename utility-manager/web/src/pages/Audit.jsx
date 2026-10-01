import { qs } from '../api.js';
import { Async, Card, Empty, PageHead, Pager, Select } from '../components/ui.jsx';
import { dateTime } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

const ENTITIES = {
  assets: 'Assets', facilities: 'Facilities', incidents: 'Incidents', projects: 'Projects',
  project_updates: 'Project updates', islands: 'Islands', atolls: 'Atolls', users: 'Users', user_scopes: 'User assignments',
};

function Changes({ action, changes }) {
  if (!changes) return null;
  const entries = Object.entries(changes);
  if (action === 'update') {
    return <ul className="changes">{entries.map(([k, v]) => <li key={k}><code>{k}</code>: {fmt(v.from)} → <strong>{fmt(v.to)}</strong></li>)}</ul>;
  }
  const shown = entries.filter(([k, v]) => v !== null && !['id', 'created_at'].includes(k)).slice(0, 8);
  return <ul className="changes">{shown.map(([k, v]) => <li key={k}><code>{k}</code>: {fmt(v)}</li>)}</ul>;
}
const fmt = (v) => (v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function Audit() {
  const [filters, setFilter] = useFilters();
  const state = useApi(`/audit${qs({ entity: filters.entity, entity_id: filters.entity_id, offset: filters.offset })}`);
  return <>
    <PageHead title="Audit trail" />
    <div className="filters">
      <Select value={filters.entity} onChange={(v) => setFilter('entity', v)} placeholder="All records" options={ENTITIES} aria-label="Record type" />
      {filters.entity_id && <button className="btn ghost small" onClick={() => setFilter('entity_id', '')}>✕ one record</button>}
    </div>
    <Async state={state}>{(page) => (
      <Card>
        {page.items.length === 0 ? <Empty>Nothing recorded.</Empty> :
          <table>
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Changes</th></tr></thead>
            <tbody>{page.items.map((e) => <tr key={e.id}>
              <td className="nowrap small">{dateTime(e.at)}</td>
              <td className="small">{e.user_name || <span className="muted">system</span>}</td>
              <td className="small nowrap">{e.action} · <button className="link" onClick={() => { setFilter('entity', e.entity); }}>{ENTITIES[e.entity] || e.entity}</button></td>
              <td className="wrap small"><Changes action={e.action} changes={e.changes} /></td>
            </tr>)}</tbody>
          </table>}
        <Pager page={page} onOffset={(o) => setFilter('offset', o)} />
      </Card>
    )}</Async>
  </>;
}
