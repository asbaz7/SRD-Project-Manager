// One section per service. Electricity: Overview · Engines · Condition
// reports · Plants. Water and sewerage: Overview · Assets · Plants.
import { Link, NavLink, useParams } from 'react-router-dom';
import { csvUrl, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/icons.jsx';
import { AssetStatus, Async, Card, Condition, ConditionMeter, Empty, PageHead, Pager, Progress, ProjectState, Select, Severity, Stat, WorkState } from '../components/ui.jsx';
import { ASSET_KINDS, ASSET_STATUS, FACILITY_KINDS, INCIDENT_CATEGORIES, SERVICES, WORK_KINDS, date, month, num, power, since } from '../format.js';
import { useApi, useFilters } from '../hooks.js';
import ConditionReports from './ConditionReports.jsx';
import Engines from './Engines.jsx';

const TABS = {
  electricity: [['', 'Overview'], ['engines', 'Engines'], ['reports', 'Condition reports'], ['plants', 'Powerhouses']],
  water: [['', 'Overview'], ['assets', 'Assets'], ['plants', 'Plants']],
  sewerage: [['', 'Overview'], ['assets', 'Assets'], ['plants', 'Plants']],
};
const SUBTITLE = {
  electricity: 'Powerhouses, gensets and their condition',
  water: 'Water plants, RO units, pumps and storage',
  sewerage: 'Sewage plants, pump stations and pumps',
};

export default function Service({ svc }) {
  const { tab = '' } = useParams();
  const { can, allowed, technical } = useAuth();
  if (!technical) return <>
    <PageHead title={SERVICES[svc].label} icon={svc} tone={svc} />
    <Card><p>This section holds technical information (engines, condition reports, assets and plants) and is available to technical staff.</p>
      <p className="muted small">You can follow <Link to={`/work?service=${svc}`}>{SERVICES[svc].label.toLowerCase()} work</Link>, <Link to={`/incidents?service=${svc}`}>incidents</Link> and <Link to={`/projects?service=${svc}`}>projects</Link>.</p></Card>
  </>;
  return <>
    <PageHead title={SERVICES[svc].label} subtitle={SUBTITLE[svc]} icon={svc} tone={svc}
      actions={<>
        {can('manager') && <Link className="btn" to={`/work/new?service=${svc}`}>Log work</Link>}
        {allowed('incidents') && <Link className="btn" to={`/incidents/new?service=${svc}`}>Report incident</Link>}
      </>} />
    <nav className="tabs glass" aria-label={`${SERVICES[svc].label} sections`}>
      {TABS[svc].map(([key, label]) => (
        <NavLink key={key} to={`/${svc}${key ? `/${key}` : ''}`} end className="tab">{label}</NavLink>
      ))}
    </nav>
    {tab === '' && <ServiceOverview svc={svc} />}
    {tab === 'engines' && svc === 'electricity' && <Engines embedded />}
    {tab === 'reports' && svc === 'electricity' && <ConditionReports embedded />}
    {tab === 'assets' && <ServiceAssets svc={svc} />}
    {tab === 'plants' && <Plants svc={svc} />}
  </>;
}

function AtollFilter({ filters, setFilter }) {
  const atolls = useApi('/atolls');
  return <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
    options={(atolls.data || []).map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />;
}

function ServiceOverview({ svc }) {
  const [filters, setFilter] = useFilters();
  const state = useApi(`/services/${svc}${qs({ atoll_id: filters.atoll_id })}`);
  const isEl = svc === 'electricity';
  return <>
    <div className="filters"><AtollFilter filters={filters} setFilter={setFilter} /></div>
    <Async state={state}>{(d) => {
      const s = d.summary;
      const kw = d.capacity.find((c) => c.unit === 'kW');
      return <>
        <div className="stats">
          <Stat label={isEl ? 'Gensets running' : 'Assets running'} value={`${s.running} of ${s.assets}`}
            sub={<>{s.down} down{s.standby ? ` · ${s.standby} standby` : ''}{s.unknown ? ` · ${s.unknown} ${isEl ? 'no report' : 'unknown'}` : ''}<br />
              {kw ? `${power(kw.available)} of ${power(kw.rated)} available` : `${s.facilities} plants · ${s.islands} islands`}</>} />
          {isEl && <Stat label="Serious faults" value={d.engines.major_fault + d.engines.not_running} tone={d.engines.major_fault + d.engines.not_running ? 'alert' : ''}
            sub={`${d.engines.not_running} not running · ${d.engines.minor_fault} minor`} to="/electricity/engines?condition=faults" />}
          {isEl && <Stat label="Overhaul due" value={d.engines.overhaul_due} tone={d.engines.overhaul_due ? 'warn' : ''}
            sub={`${d.engines.alt_service_due} alternator services due`} to="/electricity/engines?flag=overhaul" />}
          {!isEl && <Stat label="Out of service" value={s.down} tone={s.down ? 'alert' : ''} />}
          <Stat label="Work ongoing" value={d.work.length} to={`/work?service=${svc}`} />
          <Stat label="Open incidents" value={d.incidents.length} tone={d.incidents.some((x) => x.severity === 'critical') ? 'alert' : ''} to={`/incidents?service=${svc}&status=open`} />
          {isEl && <Stat label={`Reports for ${month(d.reports.expected_month)}`} value={d.reports.missing.length ? `${d.reports.missing.length} missing` : 'All in'}
            tone={d.reports.missing.length ? 'warn' : ''} to="/electricity/reports" />}
        </div>

        {isEl && <div className="grid-2">
          <Card title="Engine condition" actions={<Link to="/electricity/engines" className="btn small ghost">All engines</Link>}>
            <ConditionMeter e={d.engines} />
          </Card>
          <Card title={`Condition reports for ${month(d.reports.expected_month)}`} actions={<Link to="/electricity/reports" className="btn small">Upload</Link>}>
            {d.reports.missing.length === 0 ? <p className="all-clear"><Icon name="check" /> Every powerhouse that reports has sent it.</p> : <>
              <p className="small">{d.reports.missing.length} powerhouse{d.reports.missing.length === 1 ? ' has' : 's have'} not sent this month's report:</p>
              <p className="small">{d.reports.missing.map((r, i) => <span key={r.facility_id}>{i > 0 && ' · '}<Link to={`/islands/${r.island_id}`}>{r.atoll_code} {r.island_name}</Link>
                <span className="muted"> ({r.report_month ? `last ${month(r.report_month)}` : 'none yet'})</span></span>)}</p>
            </>}
            {d.reports.not_expected > 0 && <p className="muted small">{d.reports.not_expected} powerhouse{d.reports.not_expected === 1 ? ' is' : 's are'} not surveyed yet and not chased. Set the month reports start on the powerhouse (island page → Edit).</p>}
          </Card>
        </div>}

        <Card title={`Needs attention${d.attention.length ? ` (${d.attention.length})` : ''}`}>
          {d.attention.length === 0 ? <p className="all-clear"><Icon name="check" /> Everything with a status is in service.</p> :
            <ul className="attention-list scroll-y">{d.attention.map((a) => {
              const serious = a.condition === 'not_running' || a.status === 'down';
              return <li key={a.id}><Link to={`/assets/${a.id}`}>
                <span className={`dot ${serious ? 'bad' : 'serious'}`} aria-hidden="true">{serious ? '✕' : '■'}</span>
                <span className="grow"><strong>{a.atoll_code} · {a.island_name} · {ASSET_KINDS[a.kind]} {a.tag}</strong>
                  <small>{a.condition ? <Condition value={a.condition} /> : <AssetStatus status={a.status} />}{' '}
                    {(a.condition_source === 'status' ? a.condition_note : a.fault) || a.status_note || a.make_model || ''}{a.work_title && ` · 🔧 ${a.work_title}`}</small></span>
                <Icon name="arrow" />
              </Link></li>;
            })}</ul>}
        </Card>

        <div className="grid-3">
          <Card title={`Work (${d.work.length})`} actions={<Link to={`/work?service=${svc}`} className="btn small ghost">All</Link>}>
            {d.work.length === 0 ? <Empty>No work in progress.</Empty> :
              <table><tbody>{d.work.map((w) => <tr key={w.id}>
                <td className="wrap"><Link to={`/work/${w.id}`}>{w.title}</Link><br />
                  <small className="muted">{w.atoll_code} · {w.island_name}{w.asset_tag && ` · ${ASSET_KINDS[w.asset_kind]} ${w.asset_tag}`} · {WORK_KINDS[w.kind]}</small></td>
                <td><WorkState value={w.status} /></td>
              </tr>)}</tbody></table>}
          </Card>
          <Card title={`Incidents (${d.incidents.length})`} actions={<Link to={`/incidents?service=${svc}`} className="btn small ghost">All</Link>}>
            {d.incidents.length === 0 ? <Empty>No open incidents.</Empty> :
              <table><tbody>{d.incidents.map((x) => <tr key={x.id}>
                <td><Severity value={x.severity} /></td>
                <td className="wrap"><Link to={`/incidents/${x.id}`}>{x.title}</Link><br />
                  <small className="muted">{x.atoll_code} · {x.island_name} · {INCIDENT_CATEGORIES[x.category]} · {since(x.started_at)}</small></td>
              </tr>)}</tbody></table>}
          </Card>
          <Card title={`Projects (${d.projects.length})`} actions={<Link to={`/projects?service=${svc}&status=active`} className="btn small ghost">All</Link>}>
            {d.projects.length === 0 ? <Empty>No active projects.</Empty> :
              <table><tbody>{d.projects.map((p) => <tr key={p.id}>
                <td className="wrap"><Link to={`/projects/${p.id}`}>{p.title}</Link><br />
                  <small className="muted">{p.island_name ? `${p.atoll_code} · ${p.island_name}` : 'Regional'} · <ProjectState value={p.status} /></small></td>
                <td><Progress value={p.progress_pct} /></td>
              </tr>)}</tbody></table>}
          </Card>
        </div>
      </>;
    }}</Async>
  </>;
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
            <Link key={f.id} to={`/islands/${f.island_id}`} className="facility">
              <strong>{f.island_name}</strong>
              <span className="muted small">{f.name.toLowerCase().includes(FACILITY_KINDS[f.kind].toLowerCase().split(' ')[0]) ? f.name : `${f.name} · ${FACILITY_KINDS[f.kind]}`}</span>
              <div className="row">
                <span>{f.running} of {f.assets} running</span>
                {f.down > 0 && <span className="status bad">✕ {f.down} down</span>}
                {f.serious > 0 && <span className="status serious">■ {f.serious} serious</span>}
                {f.minor > 0 && <span className="status warn">▲ {f.minor} minor</span>}
                {f.open_work > 0 && <span className="flag info">🔧 {f.open_work}</span>}
              </div>
              {f.report_state && <div className="row"><span className={`state ${f.report_state}`}>Report: {f.report_month ? month(f.report_month) : 'none yet'}</span></div>}
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
              <td className="wrap"><Link to={`/assets/${a.id}`}><strong>{a.atoll_code} · {a.island_name} · {ASSET_KINDS[a.kind]} {a.tag}</strong></Link><br /><small className="muted">{a.make_model || '—'}</small></td>
              <td className="wrap"><AssetStatus status={a.status} />{a.status_note && <><br /><small className="muted">{a.status_note}</small></>}
                {a.status_at && <><br /><small className="muted">{date(a.status_at)}</small></>}</td>
              <td className="hide-sm">{a.facility_name}</td>
              <td className="num">{a.rated_capacity != null ? `${num(a.rated_capacity)} ${a.capacity_unit || ''}` : '—'}</td>
            </tr>)}</tbody>
          </table>}
        <Pager page={page} onOffset={(o) => setFilter('offset', o)} />
      </Card>
    )}</Async>
  </>;
}
