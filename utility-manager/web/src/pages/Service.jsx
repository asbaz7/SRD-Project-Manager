// Assets: one service at a time (electricity, water, sewerage), never
// mixed. Electricity: Engines · Monthly updates · Powerhouses. Water and
// sewerage: Assets · Plants. (The service overviews are gone: what they
// summed up is on the Overview, the Work page and the Islands map.)
import { Link, NavLink, Navigate, useParams } from 'react-router-dom';
import { csvUrl, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon, Mark } from '../components/icons.jsx';
import { AssetStatus, Async, Card, Condition, ConditionMeter, Empty, PageHead, Pager, Progress, ProjectState, Select, Severity, Stat, WorkState } from '../components/ui.jsx';
import { ASSET_KINDS, ASSET_STATUS, FACILITY_KINDS, INCIDENT_CATEGORIES, LICENCE_TYPES, SERVICES, WORK_KINDS, assetLabel, date, licenceState, licenceSummary, month, num, power, since, withUnit } from '../format.js';
import { useApi, useFilters } from '../hooks.js';
import GensetUpdates from './GensetUpdates.jsx';
import Engines from './Engines.jsx';

const TABS = {
  electricity: [['engines', 'Engines'], ['reports', 'Monthly updates'], ['plants', 'Powerhouses']],
  water: [['assets', 'Assets'], ['plants', 'Plants']],
  sewerage: [['assets', 'Assets'], ['plants', 'Plants']],
};
const SUBTITLE = {
  electricity: 'Powerhouses, gensets and their condition',
  water: 'Water plants, RO units, pumps and storage',
  sewerage: 'Sewage plants, pump stations and pumps',
};

// Where an old service address (/electricity, /water/plants…) lands now.
export const DEFAULT_TAB = { electricity: 'engines', water: 'assets', sewerage: 'assets' };

export default function Service() {
  const { svc = 'electricity', tab: asked } = useParams();
  const tab = TABS[svc]?.some(([k]) => k === asked) ? asked : DEFAULT_TAB[svc];
  const { can, allowed, technical } = useAuth();
  if (!SERVICES[svc]) return <Navigate replace to="/systems/electricity/engines" />;
  if (!technical) return <>
    <PageHead title="Assets" icon="engine" />
    <Card><p>This section holds technical information (engines, monthly updates, assets and plants) and is available to technical staff.</p>
      <p className="muted small">You can follow <Link to="/work">work</Link>, <Link to="/interruptions">interruptions</Link> and <Link to="/projects">projects</Link>.</p></Card>
  </>;
  return <>
    <PageHead title="Assets" subtitle="Gensets, plants and their equipment, one service at a time" icon="engine"
      actions={<>
        {can('manager') && <Link className="btn" to={`/work/new?service=${svc}`}>Log work</Link>}
        {allowed('incidents') && <Link className="btn" to={`/interruptions/new?service=${svc}`}>Report interruption</Link>}
      </>} />
    <nav className="svc-tabs" aria-label="Service">
      {Object.entries(SERVICES).map(([k, s]) => <NavLink key={k} to={`/systems/${k}/${DEFAULT_TAB[k]}`} className={`svc-tab ${k}${svc === k ? ' on' : ''}`}>
        <span className={`svc-badge ${k}`}><Icon name={k} size={15} /></span>{s.label}<span className="count">{SUBTITLE[k]}</span></NavLink>)}
    </nav>
    <nav className="tabs glass" aria-label={`${SERVICES[svc].label} sections`}>
      {TABS[svc].map(([key, label]) => (
        <NavLink key={key} to={`/systems/${svc}/${key}`} className={`tab${tab === key ? ' active' : ''}`}>{label}</NavLink>
      ))}
    </nav>
    {tab === 'engines' && svc === 'electricity' && <Engines embedded />}
    {tab === 'reports' && svc === 'electricity' && <GensetUpdates />}
    {tab === 'assets' && <ServiceAssets svc={svc} />}
    {tab === 'plants' && <Plants svc={svc} />}
  </>;
}

function AtollFilter({ filters, setFilter }) {
  const atolls = useApi('/atolls');
  return <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
    options={(atolls.data || []).map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />;
}

function Plants({ svc }) {
  const [filters, setFilter] = useFilters();
  const state = useApi(`/services/${svc}${qs({ atoll_id: filters.atoll_id })}`);
  return <>
    <div className="filters"><AtollFilter filters={filters} setFilter={setFilter} /></div>
    <Async state={state}>{(d) => {
      if (!d.facilities.length) return <Card><Empty>No {SERVICES[svc].label.toLowerCase()} plants recorded yet. Add them from an island's page (Islands → island → Add facility).</Empty></Card>;
      const atolls = [...new Set(d.facilities.map((f) => f.atoll_code))];
      return atolls.map((code) => (
        <Card key={code} title={`${code} · ${d.facilities.filter((f) => f.atoll_code === code).length} ${svc === 'electricity' ? 'powerhouses' : 'plants'}`}>
          <div className="facility-grid">{d.facilities.filter((f) => f.atoll_code === code).map((f) => (
            <Link key={f.id} to={`/islands/${f.island_id}?service=${svc}`} className="facility">
              <strong>{f.island_name}</strong>
              <span className="muted small">{f.name.toLowerCase().includes(FACILITY_KINDS[f.kind].toLowerCase().split(' ')[0]) ? f.name : `${f.name} · ${FACILITY_KINDS[f.kind]}`}</span>
              {svc === 'water' && Number(f.ro_tpd) > 0 && <span className="small">RO {num(f.ro_tpd)} t/day{Number(f.storage_m3) ? ` · storage ${num(f.storage_m3)} m³` : ''}</span>}
              {svc === 'sewerage' && Number(f.pump_stations) > 0 && <span className="small">{num(f.pump_stations)} pump station{Number(f.pump_stations) === 1 ? '' : 's'}</span>}
              <div className="row">
                <span>{svc !== 'electricity' && Number(f.assets) === 0 ? 'No systems recorded'
                  : svc !== 'electricity' && Number(f.unknown) === Number(f.assets) ? `${f.assets} systems · status not set`
                    : `${f.running} of ${f.assets} running`}</span>
                {f.down > 0 && <span className="status bad"><Mark name="cross" /> {f.down} down</span>}
                {f.serious > 0 && <span className="status serious"><Mark name="square" /> {f.serious} serious</span>}
                {f.minor > 0 && <span className="status warn"><Mark name="triangle" /> {f.minor} minor</span>}
                {f.open_work > 0 && <span className="flag info"><Icon name="work" size={13} />{f.open_work}</span>}
              </div>
              {licenceState(f) && <div className="row"><span className={`flag ${licenceState(f).tone}`}>{licenceState(f).text}</span></div>}
              {f.report_state && <div className="row"><span className={`state ${f.report_state}`}>Updated: {f.report_month ? month(f.report_month) : 'none yet'}</span></div>}
            </Link>
          ))}</div>
        </Card>
      ));
    }}</Async>
  </>;
}

function ServiceAssets({ svc }) {
  const [filters, setFilter] = useFilters();
  const params = { service: svc, status: filters.status, atoll_id: filters.atoll_id, q: filters.q, offset: filters.offset };
  const state = useApi(`/assets${qs(params)}`);
  return <>
    <div className="chips">
      {[['', 'All'], ...Object.entries(ASSET_STATUS).filter(([k]) => k !== 'decommissioned').map(([k, s]) => [k, s.label])].map(([k, l]) => (
        <button key={k} className={`chip ${(filters.status || '') === k ? 'on' : ''}`} onClick={() => setFilter('status', k)}>{l}</button>
      ))}
    </div>
    <div className="filters">
      <AtollFilter filters={filters} setFilter={setFilter} />
      <input type="search" placeholder="Search island, tag, model…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
      <a className="btn ghost" href={csvUrl('/assets', { ...params, offset: undefined })}>Export CSV</a>
    </div>
    <Async state={state}>{(page) => (
      <Card>
        {page.items.length === 0 ? <Empty>No {SERVICES[svc].label.toLowerCase()} assets{filters.status ? ' with this status' : ' recorded yet'}. Assets are added from an island's page.</Empty> :
          <table>
            <thead><tr><th>Asset</th><th>Status</th><th className="hide-sm">Plant</th><th className="num">Capacity</th></tr></thead>
            <tbody>{page.items.map((a) => <tr key={a.id}>
              <td className="wrap"><Link to={`/assets/${a.id}`}><strong>{a.atoll_code} · {a.island_name} · {assetLabel(a)}</strong></Link><br /><small className="muted">{a.make_model || '—'}</small></td>
              <td className="wrap"><AssetStatus status={a.status} />{a.status_note && <><br /><small className="muted">{a.status_note}</small></>}
                {a.status_at && <><br /><small className="muted">{date(a.status_at)}</small></>}</td>
              <td className="hide-sm">{a.facility_name}</td>
              <td className="num">{withUnit(a.rated_capacity, a.capacity_unit || '')}</td>
            </tr>)}</tbody>
          </table>}
        <Pager page={page} onOffset={(o) => setFilter('offset', o)} />
      </Card>
    )}</Async>
  </>;
}
