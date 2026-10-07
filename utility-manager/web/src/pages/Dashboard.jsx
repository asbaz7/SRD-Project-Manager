// Overview: what needs attention first, then one tile per service.
import { Link } from 'react-router-dom';
import { qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/icons.jsx';
import { Async, Card, ConditionMeter, Empty, PageHead, Progress, ProjectState, Select, Service, Severity, WorkState } from '../components/ui.jsx';
import { ASSET_KINDS, INCIDENT_CATEGORIES, SERVICES, WORK_KINDS, date, month, power, since } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

const greeting = () => {
  const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Indian/Maldives' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

// The short list a manager should look at first, most serious first.
function attentionItems(d) {
  const items = [];
  for (const x of d.incidents.list.filter((i) => ['critical', 'high'].includes(i.severity))) {
    items.push({ tone: 'bad', mark: '!', to: `/incidents/${x.id}`, text: x.title, sub: `${SERVICES[x.service]?.label} · ${x.atoll_code} ${x.island_name} · ${x.severity} · ${since(x.started_at)}` });
  }
  const waiting = d.documents?.waiting_for_me || [];
  if (waiting.length) {
    items.push({ tone: 'info', mark: waiting.length, to: waiting.length === 1 ? `/documents/${waiting[0].id}` : '/documents?view=waiting',
      text: `${waiting.length} document${waiting.length === 1 ? '' : 's'} waiting for your signature`,
      sub: waiting.slice(0, 4).map((x) => `${x.doc_type} ${x.ref}`).join(' · ') + (waiting.length > 4 ? ' …' : '') });
  }
  const e = d.engines || {};
  if (e.not_running) items.push({ tone: 'bad', mark: e.not_running, to: '/electricity/engines?condition=not_running', text: `${e.not_running} engine${e.not_running === 1 ? '' : 's'} not running`, sub: 'From the latest condition reports' });
  if (e.major_fault) items.push({ tone: 'serious', mark: e.major_fault, to: '/electricity/engines?condition=major_fault', text: `${e.major_fault} engine${e.major_fault === 1 ? '' : 's'} with a major fault`, sub: 'Still running — check before they fail' });
  for (const svc of ['water', 'sewerage']) {
    const down = (d.assets_down || []).filter((a) => a.service === svc);
    if (down.length) items.push({ tone: 'bad', mark: down.length, to: `/${svc}`, text: `${down.length} ${SERVICES[svc].label.toLowerCase()} asset${down.length === 1 ? '' : 's'} out of service`, sub: down.slice(0, 3).map((a) => `${a.atoll_code} ${a.island_name} ${ASSET_KINDS[a.kind]} ${a.tag}`).join(' · ') });
  }
  if (d.reports?.missing.length) items.push({ tone: 'warn', mark: d.reports.missing.length, to: '/electricity/reports', text: `${d.reports.missing.length} condition report${d.reports.missing.length === 1 ? '' : 's'} missing for ${month(d.reports.expected_month)}`, sub: d.reports.missing.slice(0, 4).map((r) => `${r.atoll_code} ${r.island_name}`).join(' · ') + (d.reports.missing.length > 4 ? ' …' : '') });
  for (const w of d.work.filter((x) => x.overdue)) {
    items.push({ tone: 'warn', mark: '⏱', to: `/work/${w.id}`, text: `${w.title} — past target date`, sub: `${w.atoll_code} ${w.island_name} · target ${date(w.target_on)}` });
  }
  if (e.overhaul_due) items.push({ tone: 'info', mark: e.overhaul_due, to: '/electricity/engines?flag=overhaul', text: `${e.overhaul_due} engine${e.overhaul_due === 1 ? '' : 's'} due for overhaul`, sub: e.alt_service_due ? `${e.alt_service_due} alternator services due as well` : '' });
  return items;
}

export default function Dashboard() {
  const { user, can, technical } = useAuth();
  const [filters, setFilter] = useFilters();
  const atolls = useApi('/atolls');
  const state = useApi(`/dashboard${qs({ atoll_id: filters.atoll_id })}`);

  return <>
    <PageHead title={`${greeting()}, ${user.fullName.split(' ')[0]}`} subtitle={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Indian/Maldives' })}
      actions={<Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
        options={(atolls.data || []).map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />} />
    <Async state={state}>{(d) => {
      const items = attentionItems(d);
      const el = d.services.electricity;
      return <>
        <Card title={`Needs attention${items.length ? ` (${items.length})` : ''}`}>
          {items.length === 0 ? <p className="all-clear"><Icon name="check" /> Nothing needs attention right now.</p> :
            <ul className="attention-list">{items.slice(0, 8).map((it, i) => (
              <li key={i}><Link to={it.to}>
                <span className={`dot ${it.tone}`} aria-hidden="true">{it.mark}</span>
                <span className="grow"><strong>{it.text}</strong>{it.sub && <small>{it.sub}</small>}</span>
                <Icon name="arrow" />
              </Link></li>
            ))}</ul>}
          {items.length > 8 && <p className="muted small">and {items.length - 8} more</p>}
        </Card>

        {d.technical && <div className="grid-3">
          <ServiceTile svc="electricity" s={el}
            hero={<>{el.running}<small> of {el.assets} gensets running</small></>}
            facts={[
              [power(el.available_kw), `available of ${power(el.installed_kw)}`],
              [d.engines.major_fault + d.engines.not_running, 'serious faults', d.engines.major_fault + d.engines.not_running > 0],
              [el.open_work, 'work ongoing'],
            ]} />
          {['water', 'sewerage'].map((svc) => {
            const s = d.services[svc];
            return <ServiceTile key={svc} svc={svc} s={s}
              hero={s.assets ? <>{s.running}<small> of {s.assets} assets running</small></> : <small>No assets recorded yet</small>}
              facts={[[s.facilities, `plant${s.facilities === 1 ? '' : 's'} · ${s.islands} islands`], [s.down, 'out of service', s.down > 0], [s.open_work, 'work ongoing']]} />;
          })}
        </div>}

        <div className={d.technical ? 'grid-2' : ''}>
          {d.technical && <Card title="Engine condition" actions={<Link to="/electricity/engines" className="btn small ghost">All engines</Link>}>
            <ConditionMeter e={d.engines} />
            <p className="muted small">{d.engines.total} gensets · from the latest monthly condition reports</p>
          </Card>}
          <Card title={`Work in progress (${d.work.length})`} actions={can('manager') && technical && <Link to="/work/new" className="btn small">Log work</Link>}>
            {d.work.length === 0 ? <Empty>No work in progress.</Empty> :
              <div className="scroll-y"><table><tbody>{d.work.map((w) => <tr key={w.id}>
                <td className="wrap"><Link to={`/work/${w.id}`}><strong>{w.title}</strong></Link><br />
                  <small className="muted"><Service value={w.service} short />{w.atoll_code} · {w.island_name}{w.asset_tag && ` · ${ASSET_KINDS[w.asset_kind]} ${w.asset_tag}`} · {WORK_KINDS[w.kind]}</small>
                  {w.last_update && <div className="small">{w.last_update}</div>}</td>
                <td><WorkState value={w.status} /></td>
              </tr>)}</tbody></table></div>}
          </Card>
        </div>

        <div className="grid-2">
          <Card title={`Open incidents (${d.incidents.open})`} actions={can('manager') && <Link to="/incidents/new" className="btn small">Report incident</Link>}>
            {d.incidents.list.length === 0 ? <Empty>No open incidents.</Empty> :
              <table><tbody>{d.incidents.list.map((x) => <tr key={x.id}>
                <td><Severity value={x.severity} /></td>
                <td className="wrap"><Link to={`/incidents/${x.id}`}>{x.title}</Link><br />
                  <small className="muted"><Service value={x.service} short />{x.atoll_code} · {x.island_name} · {INCIDENT_CATEGORIES[x.category]} · {since(x.started_at)}</small></td>
              </tr>)}</tbody></table>}
          </Card>
          <Card title={`Active projects (${d.projects.active})`} actions={<Link to="/projects?status=active" className="btn small ghost">All projects</Link>}>
            {d.projects.list.length === 0 ? <Empty>No active projects.</Empty> :
              <table><tbody>{d.projects.list.map((p) => <tr key={p.id}>
                <td className="wrap"><Link to={`/projects/${p.id}`}>{p.title}</Link><br />
                  <small className="muted"><Service value={p.service} short />{p.island_name ? `${p.atoll_code} · ${p.island_name}` : 'Regional'} · <ProjectState value={p.status} /></small></td>
                <td className="nowrap"><Progress value={p.progress_pct} />
                  {p.target_date && <><br /><small className={p.overdue ? 'bad' : 'muted'}>{p.overdue ? '⚠ due ' : 'due '}{date(p.target_date)}</small></>}</td>
              </tr>)}</tbody></table>}
          </Card>
        </div>
      </>;
    }}</Async>
  </>;
}

function ServiceTile({ svc, s, hero, facts }) {
  return (
    <Link to={SERVICES[svc].path} className={`tile ${svc}`}>
      <div className="tile-head">
        <span className="icon-wrap"><Icon name={svc} /></span>
        <h2>{SERVICES[svc].label}</h2>
        <span className="go"><Icon name="arrow" /></span>
      </div>
      <div className="hero">{hero}</div>
      <div className="tile-facts">{facts.map(([v, l, alert], i) => <div key={i} className={alert ? 'alert' : ''}><strong>{v}</strong><span>{l}</span></div>)}</div>
      {s.open_incidents > 0 && <span className="flag bad">{s.open_incidents} open incident{s.open_incidents === 1 ? '' : 's'}</span>}
    </Link>
  );
}
