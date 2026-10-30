// The services of an atoll or one island, at a glance: a card per service
// it has (electricity, water, sewerage) with its plants, what is running or
// down, faults, monthly updates, licences and any open outage, and a row
// per plant. Work has its own page; a link leads there.
import { Link } from 'react-router-dom';
import { qs } from '../api.js';
import { useApi } from '../hooks.js';
import { SERVICES, month, num } from '../format.js';
import { Icon, Mark } from './icons.jsx';

const KEYS = ['electricity', 'water', 'sewerage'];

export default function ServicesOverview({ atollId, islandId, services, onIsland }) {
  const has = (k) => services.includes(k);
  const data = {
    electricity: useApi(has('electricity') ? `/services/electricity${qs({ atoll_id: atollId })}` : null),
    water: useApi(has('water') ? `/services/water${qs({ atoll_id: atollId })}` : null),
    sewerage: useApi(has('sewerage') ? `/services/sewerage${qs({ atoll_id: atollId })}` : null),
  };
  const outages = useApi(`/incidents${qs({ atoll_id: islandId ? undefined : atollId, island_id: islandId, status: 'open', category: 'outage', limit: 200 })}`);
  const svcOnly = services.length === 1 ? services[0] : undefined;
  const work = useApi(`/work${qs({ atoll_id: islandId ? undefined : atollId, island_id: islandId, status: 'open', limit: 200 })}`);
  const shown = KEYS.filter(has);
  if (!shown.length) return <p className="muted small">No services recorded.</p>;
  return <>
    <div className="svc-overview">
    {work.data && <WorkSummary items={work.data.items} to={`/work${qs({ atoll_id: islandId ? undefined : atollId, island_id: islandId, service: svcOnly })}`} />}
    {shown.map((k) => {
      const all = data[k].data?.facilities;
      const plants = all ? all.filter((f) => !islandId || f.island_id === islandId) : null;
      const off = (outages.data?.items || []).filter((o) => o.service === k);
      return <ServiceCard key={k} svc={k} plants={plants} off={off} many={!islandId} onIsland={onIsland} atollId={atollId} />;
    })}</div>
  </>;
}

// The service's full lists for the atoll (all gensets, monthly updates, plants).
const LISTS = {
  electricity: [['engines', 'Gensets'], ['reports', 'Monthly updates'], ['plants', 'Powerhouses']],
  water: [['assets', 'Assets'], ['updates', 'Monthly updates'], ['plants', 'Plants']],
  sewerage: [['assets', 'Assets'], ['updates', 'Monthly updates'], ['plants', 'Plants']],
};

// The open work of the atoll or island, summed up, with the way to the list.
const HELD = ['on_hold', 'awaiting_parts'];
function WorkSummary({ items, to }) {
  const now = Date.now();
  const n = (f) => items.filter(f).length;
  const tiles = [
    [n((w) => !HELD.includes(w.status)), 'Ongoing', 'prog'],
    [n((w) => HELD.includes(w.status)), 'On hold', 'hold'],
    [n((w) => w.overdue), 'Overdue', 'over'],
    [n((w) => !w.overdue && w.target_on && new Date(`${w.target_on}T23:59:59`) - now <= 7 * 86400000), 'Due in 7 days', 'hold'],
  ];
  const next = items.filter((w) => w.overdue).concat(items.filter((w) => !w.overdue)).slice(0, 3);
  return <section className="svc-card work">
    <header><span className="svc-badge work"><Icon name="work" size={15} /></span><strong>Work</strong>
      <span className="muted small">{num(items.length)} open</span></header>
    <div className="svc-figs">{tiles.map(([v, l, t]) => <span key={l} className={v ? t : ''}><b>{num(v)}</b>{l}</span>)}</div>
    {next.length > 0 && <ul className="svc-plants">{next.map((w) => <li key={w.id}>
      <Link to={`/work/${w.id}`}>{w.title}</Link><span className={w.overdue ? 'bad' : 'muted'}>{w.overdue ? 'Overdue' : w.island_name}</span></li>)}</ul>}
    <Link className="svc-work-link" to={to}>{items.length ? 'All open work' : 'Work'} <Icon name="arrow" size={14} /></Link>
  </section>;
}

function ServiceCard({ svc, plants, off, many, onIsland, atollId }) {
  const sum = (k) => (plants || []).reduce((n, f) => n + Number(f[k] || 0), 0);
  const assets = sum('assets'), running = sum('running'), down = sum('down');
  const faults = sum('serious') + sum('minor');
  const due = (plants || []).filter((f) => f.report_state === 'missing' || f.report_state === 'never').length;
  const expired = (plants || []).filter((f) => f.licence_status?.match(/expired/i) || (f.licence_expires_on && f.licence_expires_on < new Date().toISOString().slice(0, 10))).length;
  const what = svc === 'electricity' ? 'gensets' : 'systems';
  const offIslands = new Set(off.map((o) => o.island_id)).size;
  return <section className={`svc-card ${svc}${off.length || down ? ' alert' : ''}`}>
    <header>
      <span className={`svc-badge ${svc}`}><Icon name={svc} size={15} /></span>
      <strong>{SERVICES[svc].label}</strong>
      <span className="muted small">{plants ? `${plants.length} ${svc === 'electricity' ? 'powerhouse' : 'plant'}${plants.length === 1 ? '' : 's'}` : '…'}</span>
    </header>
    {plants && <>
      {off.length > 0 && <p className="svc-out"><Mark name="cross" /> Supply interrupted{many ? ` on ${offIslands} island${offIslands === 1 ? '' : 's'}` : ''}: {off[0].title}</p>}
      <div className="svc-figs">
        <span><b>{assets ? `${num(running)} of ${num(assets)}` : '—'}</b>{what} running</span>
        <span className={down ? 'bad' : ''}><b>{num(down)}</b>down</span>
        <span className={faults ? 'warn' : ''}><b>{num(faults)}</b>with faults</span>
        {svc === 'water' && sum('ro_tpd') > 0 && <span><b>{num(sum('ro_tpd'))}</b>t/day RO</span>}
      </div>
      {(due > 0 || expired > 0) && <p className="small">{due > 0 && <span className="warn-text">{due} monthly update{due === 1 ? '' : 's'} due</span>}
        {due > 0 && expired > 0 && ' · '}{expired > 0 && <span className="bad">{expired} licence{expired === 1 ? '' : 's'} expired</span>}</p>}
      {plants.length > 0 && <ul className="svc-plants">{plants.map((f) => <li key={f.id}>
        {many && onIsland ? <button type="button" className="link" onClick={() => onIsland({ id: f.island_id })}>{f.island_name}</button> : <span>{f.name}</span>}
        <span className="muted">{Number(f.assets) ? `${f.running}/${f.assets}` : '—'}{f.report_month ? ` · ${month(f.report_month)}` : ''}</span>
        {Number(f.down) > 0 && <span className="bad"><Mark name="cross" /> {f.down}</span>}
      </li>)}</ul>}
    </>}
  </section>;
}
