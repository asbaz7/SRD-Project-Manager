import { Link } from 'react-router-dom';
import { AssetStatus, Async, Card, Empty, PageHead, Select, Service, Severity, Stat } from '../components/ui.jsx';
import { ASSET_KINDS, INCIDENT_CATEGORIES, SERVICES, date, num, since, withUnit } from '../format.js';
import { useApi, useFilters } from '../hooks.js';
import { qs } from '../api.js';

export default function Dashboard() {
  const [filters, setFilter] = useFilters();
  const atolls = useApi('/atolls');
  const state = useApi(`/dashboard${qs({ atoll_id: filters.atoll_id })}`);

  return <>
    <PageHead title="Overview" actions={
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
        options={(atolls.data || []).map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />
    } />
    <Async state={state}>{(d) => <>
      <div className="stats">
        <Stat label="Gensets running" value={`${d.services.electricity.running} of ${d.services.electricity.assets}`}
          sub={`${num(d.services.electricity.available_kw)} kW available of ${num(d.services.electricity.installed_kw)} kW`} />
        <Stat label="Assets down / in maintenance" value={d.services.electricity.down + d.services.water.down + d.services.sewerage.down}
          tone={d.assets_down.length ? 'alert' : ''} to="/islands" />
        <Stat label="Open incidents" value={d.incidents.open} tone={d.incidents.by_severity.critical ? 'alert' : ''}
          sub={['critical', 'high'].filter((s) => d.incidents.by_severity[s]).map((s) => `${d.incidents.by_severity[s]} ${s}`).join(' · ')} to="/incidents?status=open" />
        <Stat label="Active projects" value={d.projects.active} sub={d.projects.overdue ? `${d.projects.overdue} overdue` : ''}
          tone={d.projects.overdue ? 'warn' : ''} to="/projects?status=active" />
      </div>

      <h2 className="section-title">Yesterday · {date(d.date)}</h2>
      <div className="stats">
        <Stat label="Energy generated" value={withUnit(d.yesterday.gross_generation_kwh, 'kWh')} />
        <Stat label="Fuel consumed" value={withUnit(d.yesterday.fuel_consumed_l, 'L')}
          sub={d.yesterday.specific_fuel_kwh_per_l && `${num(d.yesterday.specific_fuel_kwh_per_l, 2)} kWh/L`} />
        <Stat label="Water produced" value={withUnit(d.yesterday.water_produced_m3, 'm³')} />
        <Stat label="Sewage pumped" value={withUnit(d.yesterday.sewage_pumped_m3, 'm³')} />
      </div>

      <div className="grid-2">
        <Card title={`Open incidents (${d.incidents.open})`} actions={<Link to="/incidents/new" className="btn small">Report incident</Link>}>
          {d.incidents.list.length === 0 ? <Empty>No open incidents.</Empty> :
            <table><tbody>{d.incidents.list.map((x) => <tr key={x.id}>
              <td><Severity value={x.severity} /></td>
              <td className="wrap"><Link to={`/incidents/${x.id}`}>{x.title}</Link><br />
                <small className="muted"><Service value={x.service} short /> {x.atoll_code} · {x.island_name} · {INCIDENT_CATEGORIES[x.category]} · {since(x.started_at)}</small></td>
            </tr>)}</tbody></table>}
        </Card>

        <Card title={`Daily logs missing for ${date(d.date)} (${d.missing_logs.length})`}>
          {d.missing_logs.length === 0 ? <Empty>All facilities have reported. 🎉</Empty> :
            <div className="scroll-y"><table><tbody>{d.missing_logs.map((f) => <tr key={f.id}>
              <td><Service value={f.service} short /></td>
              <td><Link to={`/log?facility_id=${f.id}&date=${d.date}`}>{f.atoll_code} · {f.island_name}</Link> <span className="muted small">{f.name}</span></td>
              <td className="muted small nowrap">{f.last_reading_date ? `last ${date(f.last_reading_date)}` : 'never'}</td>
            </tr>)}</tbody></table></div>}
        </Card>
      </div>

      <Card title={`Assets out of service (${d.assets_down.length})`}>
        {d.assets_down.length === 0 ? <Empty>Everything with a status is in service.</Empty> :
          <table>
            <thead><tr><th>Island</th><th>Asset</th><th>Status</th><th className="hide-sm">Note</th><th className="hide-sm">Since</th></tr></thead>
            <tbody>{d.assets_down.map((a) => <tr key={a.id}>
              <td><Link to={`/islands/${a.island_id}`}>{a.atoll_code} · {a.island_name}</Link></td>
              <td><Link to={`/assets/${a.id}`}><Service value={a.service} short /> {ASSET_KINDS[a.kind]} {a.tag}</Link>
                <br /><small className="muted">{a.make_model} {a.rated_capacity ? `· ${num(a.rated_capacity)} ${a.capacity_unit || ''}` : ''}</small></td>
              <td><AssetStatus status={a.status} /></td>
              <td className="wrap hide-sm">{a.status_note || <span className="muted">—</span>}</td>
              <td className="muted small hide-sm">{date(a.status_at)}</td>
            </tr>)}</tbody>
          </table>}
      </Card>

      <Card title="By service">
        <table>
          <thead><tr><th>Service</th><th className="num">Islands</th><th className="num">Facilities</th><th className="num">Assets</th><th className="num">Running</th><th className="num">Down</th><th className="num hide-sm">No status</th></tr></thead>
          <tbody>{Object.keys(SERVICES).map((s) => { const v = d.services[s]; return <tr key={s}>
            <td><Service value={s} /></td><td className="num">{v.islands}</td><td className="num">{v.facilities}</td><td className="num">{v.assets}</td>
            <td className="num">{v.running}</td><td className={`num ${v.down ? 'bad' : ''}`}>{v.down}</td><td className="num hide-sm muted">{v.unknown}</td>
          </tr>; })}</tbody>
        </table>
      </Card>
    </>}</Async>
  </>;
}
