import { Link } from 'react-router-dom';
import { qs } from '../api.js';
import { Async, Card, PageHead, Select, Service } from '../components/ui.jsx';
import { num } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

export default function Islands() {
  const [filters, setFilter] = useFilters();
  const atolls = useApi('/atolls');
  const state = useApi(`/islands${qs({ atoll_id: filters.atoll_id, q: filters.q })}`);

  return <>
    <PageHead title="Islands & assets" />
    <div className="filters">
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
        options={(atolls.data || []).map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />
      <input type="search" placeholder="Search island…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
    </div>
    <Async state={state}>{(islands) => (
      <Card>
        <table>
          <thead><tr><th>Island</th><th>Services</th><th>Gensets</th><th className="num hide-sm">Installed</th><th className="num hide-sm">Fuel capacity</th><th className="num">Open incidents</th><th className="num hide-sm">Active projects</th></tr></thead>
          <tbody>{islands.map((i) => <tr key={i.id}>
            <td><Link to={`/islands/${i.id}`}><strong>{i.atoll_code}</strong> · {i.name}</Link></td>
            <td>{i.services.map((s) => <Service key={s} value={s} short />)}</td>
            <td>{i.genset_count ? <>{i.running_count} of {i.genset_count} running{i.down_count > 0 && <span className="status bad"> · ✕ {i.down_count} down</span>}</> : <span className="muted">—</span>}</td>
            <td className="num hide-sm">{i.installed_kw ? `${num(i.installed_kw)} kW` : '—'}</td>
            <td className="num hide-sm">{i.fuel_capacity_l ? `${num(i.fuel_capacity_l)} L` : <span className="muted">—</span>}</td>
            <td className={`num ${i.open_incidents ? 'bad' : ''}`}>{i.open_incidents}</td>
            <td className="num hide-sm">{i.active_projects}</td>
          </tr>)}</tbody>
        </table>
        <p className="muted small">{islands.length} islands</p>
      </Card>
    )}</Async>
  </>;
}
