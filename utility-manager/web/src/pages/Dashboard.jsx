import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { AssetStatus, Async, Card, Empty, PageHead, Progress, ProjectState, Select, Service, Severity, Stat, WorkState } from '../components/ui.jsx';
import { ASSET_KINDS, INCIDENT_CATEGORIES, SERVICES, WORK_KINDS, date, month, num, since, withUnit } from '../format.js';
import { useApi, useFilters } from '../hooks.js';
import { qs } from '../api.js';

export default function Dashboard() {
  const { can } = useAuth();
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
        <Stat label="Engines with major faults" value={d.engines.major_fault + d.engines.not_running}
          sub={`${d.engines.not_running} not running · ${d.engines.minor_fault} minor faults`}
          tone={d.engines.major_fault + d.engines.not_running ? 'alert' : ''} to="/engines?condition=faults" />
        <Stat label="Overhaul due" value={d.engines.overhaul_due} sub={d.engines.alt_service_due ? `${d.engines.alt_service_due} alternator services due` : ''}
          tone={d.engines.overhaul_due ? 'warn' : ''} to="/engines?flag=overhaul" />
        <Stat label="Work in progress" value={d.work.length} to="/work" />
        <Stat label="Open incidents" value={d.incidents.open} tone={d.incidents.by_severity.critical ? 'alert' : ''}
          sub={['critical', 'high'].filter((s) => d.incidents.by_severity[s]).map((s) => `${d.incidents.by_severity[s]} ${s}`).join(' · ')} to="/incidents?status=open" />
        <Stat label="Fuel capacity" value={withUnit(d.fuel_storage.capacity_l, 'L')}
          sub={d.fuel_storage.not_set ? `${d.fuel_storage.not_set} powerhouse${d.fuel_storage.not_set === 1 ? '' : 's'} not set` : ''} to="/islands" />
      </div>

      <div className="grid-2">
        <Card title="Engine condition" actions={<Link to="/engines" className="btn small ghost">All engines</Link>}>
          <EngineMeter e={d.engines} />
          <p className="muted small">From the latest monthly condition reports.</p>
        </Card>
        <Card title={`Reports for ${month(d.reports.expected_month)} · ${d.reports.missing.length ? `${d.reports.missing.length} of ${d.reports.total} missing` : 'all in'}`}
          actions={<Link to="/reports" className="btn small">Upload reports</Link>}>
          {d.reports.missing.length === 0 ? <Empty>Every powerhouse has sent its report. 🎉</Empty> :
            <div className="scroll-y small">{d.reports.missing.map((r, i) => <span key={r.facility_id}>
              {i > 0 && ' · '}<Link to={`/islands/${r.island_id}`}>{r.atoll_code} {r.island_name}</Link>
              <span className="muted"> ({r.report_month ? `last ${month(r.report_month)}` : 'none yet'})</span>
            </span>)}</div>}
        </Card>
      </div>

      <div className="grid-2">
        <Card title={`Work in progress (${d.work.length})`} actions={can('manager') && <Link to="/work/new" className="btn small">Log work</Link>}>
          {d.work.length === 0 ? <Empty>No work in progress.</Empty> :
            <div className="scroll-y"><table><tbody>{d.work.map((w) => <tr key={w.id}>
              <td className="wrap"><Link to={`/work/${w.id}`}>{w.title}</Link><br />
                <small className="muted">{w.atoll_code} · {w.island_name}{w.asset_tag && ` · ${ASSET_KINDS[w.asset_kind]} ${w.asset_tag}`} · {WORK_KINDS[w.kind]}</small>
                {w.last_update && <div className="small">{w.last_update}</div>}</td>
              <td><WorkState value={w.status} />{w.target_on && <><br /><small className={w.overdue ? 'bad' : 'muted'}>{w.overdue ? '⚠ ' : ''}{date(w.target_on)}</small></>}</td>
            </tr>)}</tbody></table></div>}
        </Card>
        <Card title={`Open incidents (${d.incidents.open})`} actions={can('manager') && <Link to="/incidents/new" className="btn small">Report incident</Link>}>
          {d.incidents.list.length === 0 ? <Empty>No open incidents.</Empty> :
            <table><tbody>{d.incidents.list.map((x) => <tr key={x.id}>
              <td><Severity value={x.severity} /></td>
              <td className="wrap"><Link to={`/incidents/${x.id}`}>{x.title}</Link><br />
                <small className="muted"><Service value={x.service} short /> {x.atoll_code} · {x.island_name} · {INCIDENT_CATEGORIES[x.category]} · {since(x.started_at)}</small></td>
            </tr>)}</tbody></table>}
        </Card>

        <Card title={`Active projects (${d.projects.active})`} actions={<Link to="/projects?status=active" className="btn small ghost">All projects</Link>}>
          {d.projects.list.length === 0 ? <Empty>No active projects.</Empty> :
            <div className="scroll-y"><table><tbody>{d.projects.list.map((p) => <tr key={p.id}>
              <td className="wrap"><Link to={`/projects/${p.id}`}>{p.title}</Link><br />
                <small className="muted"><Service value={p.service} short /> {p.island_name ? `${p.atoll_code} · ${p.island_name}` : 'Regional'} · <ProjectState value={p.status} /></small></td>
              <td className="nowrap"><Progress value={p.progress_pct} />
                {p.target_date && <><br /><small className={p.overdue ? 'bad' : 'muted'}>{p.overdue ? '⚠ due ' : 'due '}{date(p.target_date)}</small></>}</td>
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

// Share of engines in each condition, as one bar with clickable counts.
function EngineMeter({ e }) {
  const parts = [
    ['ok', 'OK', e.ok, 'ok'], ['minor_fault', 'Minor fault', e.minor_fault, 'warn'],
    ['major_fault', 'Major fault', e.major_fault, 'bad'], ['not_running', 'Not running', e.not_running, 'bad'],
    ['no_report', 'No report', e.no_report, 'none'],
  ];
  const total = e.total || 1;
  return <>
    <div className="meter" role="img" aria-label={parts.map(([, l, n]) => `${n} ${l}`).join(', ')}>
      {parts.map(([k, l, n, tone]) => n > 0 && <span key={k} className={tone} style={{ width: `${(100 * n) / total}%` }} title={`${n} ${l}`} />)}
    </div>
    <table><tbody>{parts.map(([k, l, n, tone]) => <tr key={k}>
      <td><Link to={`/engines?condition=${k}`}><span className={`status ${tone}`}>{l}</span></Link></td>
      <td className="num"><strong>{n}</strong></td>
    </tr>)}</tbody></table>
  </>;
}
